import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3099";
const debugPort = Number(process.env.E2E_CHROME_PORT || 9222);

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const candidate of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try {
      return execFileSync("which", [candidate], { encoding: "utf8" }).trim();
    } catch {
      // Try the next browser name.
    }
  }
  throw new Error("Chrome/Chromium executable was not found on the runner");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJson(url, attempts = 200) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function waitForProcessExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.removeListener("exit", onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once("exit", onExit);
  });
}

async function stopBrowser(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if (await waitForProcessExit(child, 2500)) return;
  child.kill("SIGKILL");
  await waitForProcessExit(child, 1500);
}

async function cleanupProfile(path) {
  try {
    await rm(path, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 125,
    });
  } catch (error) {
    // The GitHub runner is ephemeral. A late Chrome helper must never turn a
    // successful browser suite into a failed CI run during best-effort cleanup.
    console.warn(`Could not fully remove Chrome E2E profile ${path}:`, error);
  }
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  close() {
    this.socket.close();
  }
}

async function createPage() {
  const endpoint = `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent("about:blank")}`;
  const response = await fetch(endpoint, { method: "PUT" });
  if (!response.ok) throw new Error(`Chrome refused a new tab: HTTP ${response.status}`);
  const page = await response.json();
  const client = new CdpClient(page.webSocketDebuggerUrl);
  await client.open();
  return client;
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
  }
  return result.result?.value;
}

async function navigate(client, path) {
  await client.send("Page.navigate", { url: new URL(path, baseUrl).toString() });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = await evaluate(client, "document.readyState === 'complete'").catch(() => false);
    if (ready) return;
    await sleep(50);
  }
  throw new Error(`Timed out navigating to ${path}`);
}

async function waitFor(client, expression, label) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const value = await evaluate(client, expression).catch(() => false);
    if (value) return value;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function classifyHttpFailure(response, type) {
  const status = Number(response?.status || 0);
  if (status < 400) return undefined;
  let url;
  try {
    url = new URL(response.url);
  } catch {
    return `${status} ${type || "resource"} ${response?.url || "unknown URL"}`;
  }

  const base = new URL(baseUrl);
  const sameOrigin = url.origin === base.origin;
  const isApi = sameOrigin && url.pathname.startsWith("/api/");

  // Empty-state API 404s are part of the product contract. Server errors must
  // still fail; bounded/explicit 4xx application states are not browser faults.
  if (isApi) return status >= 500 ? `${status} API ${url.pathname}` : undefined;

  return `${status} ${type || "resource"} ${url.pathname}`;
}

const chrome = findChrome();
const userDataDir = await mkdtemp(join(tmpdir(), "loto-lab-e2e-"));
const browser = spawn(chrome, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  "--no-first-run",
  "--no-default-browser-check",
  "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });

let client;
try {
  await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  client = await createPage();
  const runtimeErrors = [];
  const severeLogs = [];
  const networkErrors = [];
  client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    runtimeErrors.push(exceptionDetails?.exception?.description || exceptionDetails?.text || "Runtime exception");
  });
  client.on("Log.entryAdded", ({ entry }) => {
    if (entry?.level === "error" && entry?.source !== "network") {
      severeLogs.push(`${entry.source || "console"}: ${entry.text || "Browser log error"}`);
    }
  });
  client.on("Network.responseReceived", ({ response, type }) => {
    const failure = classifyHttpFailure(response, type);
    if (failure) networkErrors.push(failure);
  });
  await Promise.all([
    client.send("Page.enable"),
    client.send("Runtime.enable"),
    client.send("Log.enable"),
    client.send("Network.enable"),
  ]);

  await navigate(client, "/");
  await waitFor(client, "Boolean(document.querySelector('[data-shell-nav]'))", "main navigation");
  const home = await evaluate(client, `({
    title: document.title,
    build: document.documentElement.dataset.build || '',
    text: document.body.innerText.slice(0, 500),
    content: Boolean(document.querySelector('#content'))
  })`);
  assert(home.title.includes("Loto Lab"), "Main page title is invalid");
  assert(home.build.length === 12, "Built page is missing its 12-character build version");
  assert(home.content, "Main application content root is missing");
  assert(home.text.includes("Painel"), "Main application rendered no meaningful navigation content");

  await navigate(client, "/#analysis");
  await waitFor(client, "Boolean(document.querySelector('.a2-shell'))", "Analyses single-map shell");
  await waitFor(client, "Boolean(document.querySelector('[data-a2-number-map] .a2-map-number'))", "number map");
  const analysisSurface = await evaluate(client, `(() => ({
    tabs: document.querySelectorAll('[data-a2-tab]').length,
    mapNumbers: document.querySelectorAll('[data-a2-number-map] .a2-map-number').length,
    filters: [...document.querySelectorAll('[data-a2-map-filter]')].map((node) => node.textContent.trim()),
    technical: document.querySelectorAll('.a2-technical-block').length,
    hasWarning: document.body.innerText.includes('Histórico, não previsão')
  }))()`);
  assert(analysisSurface.tabs === 0, `Analyses still exposes technical tabs: ${JSON.stringify(analysisSurface)}`);
  assert(analysisSurface.mapNumbers > 0, "Analyses rendered no number map");
  assert(
    ["Todas", "Fortes", "Intermediárias", "Frias"].every((label) => analysisSurface.filters.includes(label)),
    `Analyses filters are incomplete: ${JSON.stringify(analysisSurface)}`,
  );
  assert(analysisSurface.technical === 5, `Analyses technical disclosure is incomplete: ${JSON.stringify(analysisSurface)}`);
  assert(analysisSurface.hasWarning, "Analyses is missing the historical/non-predictive principle");

  await evaluate(client, "document.querySelector('[data-a2-map-filter=strong]').click(); true");
  await waitFor(
    client,
    "[...document.querySelectorAll('.a2-map-number:not([hidden])')].every((node) => node.dataset.a2Tier === 'strong')",
    "strong-number filter",
  );
  await evaluate(client, "document.querySelector('[data-a2-map-filter=all]').click(); true");
  await evaluate(client, "document.querySelector('.a2-map-number').click(); true");
  await waitFor(client, "document.querySelector('#a2-detail')?.open === true", "number detail modal");
  assert(
    await evaluate(client, "document.querySelector('#a2-detail').innerText.includes('Decomposição da pontuação')"),
    "Number detail is missing score decomposition",
  );
  assert(
    await evaluate(client, "document.querySelector('#a2-detail')?.tagName === 'DIALOG' && document.querySelector('#a2-detail').matches(':modal')"),
    "Number detail is not a native modal dialog",
  );
  await evaluate(client, `(() => {
    const detail = document.querySelector('#a2-detail');
    detail.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return true;
  })()`);
  await waitFor(client, "document.querySelector('#a2-detail')?.open === false", "number detail Escape close");
  assert(
    await evaluate(client, "!document.body.classList.contains('a2-detail-open')"),
    "Desktop dialog close left the body scroll lock active",
  );

  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate(client, "/#analysis");
  await waitFor(client, "Boolean(document.querySelector('.a2-shell'))", "mobile Analyses 2.0 shell");
  const mobileAnalysis = await evaluate(client, `(() => {
    const map = document.querySelector('[data-a2-number-map]');
    const firstNumber = document.querySelector('.a2-map-number');
    return {
      width: document.documentElement.clientWidth,
      mobileBreakpoint: matchMedia('(max-width: 680px)').matches,
      mapVisible: Boolean(map && getComputedStyle(map).display !== 'none'),
      firstNumberVisible: Boolean(firstNumber && firstNumber.getBoundingClientRect().width > 0),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    };
  })()`);
  assert(mobileAnalysis.mobileBreakpoint, `Analyses responsive breakpoint was not active: ${JSON.stringify(mobileAnalysis)}`);
  assert(mobileAnalysis.width <= 390, `Analyses responsive viewport is wider than expected: ${JSON.stringify(mobileAnalysis)}`);
  assert(mobileAnalysis.mapVisible, "Analyses number map is not visible on mobile");
  assert(mobileAnalysis.firstNumberVisible, "Analyses number map has no visible entries on mobile");
  assert(!mobileAnalysis.overflow, `Analyses overflows the mobile viewport: ${JSON.stringify(mobileAnalysis)}`);
  await evaluate(client, "document.querySelector('.a2-map-number').click(); true");
  await waitFor(client, "document.querySelector('#a2-detail')?.open === true", "mobile number detail modal");
  const mobileDrawer = await evaluate(client, `(() => {
    const detail = document.querySelector('#a2-detail');
    const rect = detail.getBoundingClientRect();
    return { width: rect.width, left: rect.left, viewport: document.documentElement.clientWidth };
  })()`);
  assert(mobileDrawer.width <= mobileDrawer.viewport + 1, "Analyses detail drawer overflows the mobile viewport");
  assert(mobileDrawer.left >= -1, "Analyses detail drawer starts outside the mobile viewport");

  // Navigate away without explicitly closing the modal: the Analyses lifecycle
  // must release scroll lock even when #content is replaced by another view.
  await evaluate(client, "location.hash = 'dashboard'; true");
  await waitFor(client, "!document.querySelector('.a2-shell')", "leave Analyses with modal open");
  await waitFor(client, "!document.body.classList.contains('a2-detail-open')", "dialog navigation cleanup");

  const mobileNav = await evaluate(client, `(() => {
    const items = [...document.querySelectorAll('[data-shell-nav] [data-nav-key]')];
    return {
      labels: items.map((item) => item.getAttribute('aria-label')),
      visible: items.filter((item) => getComputedStyle(item).display !== 'none').length,
      hasMore: Boolean(document.querySelector('[data-nav-more]'))
    };
  })()`);
  assert(mobileNav.visible === 3, `Mobile navigation must expose exactly three destinations: ${JSON.stringify(mobileNav)}`);
  assert(
    ["Painel", "Análises", "Gerar jogos"].every((label) => mobileNav.labels.includes(label)),
    `Mobile navigation is missing canonical destinations: ${JSON.stringify(mobileNav)}`,
  );
  assert(!mobileNav.hasMore, "Mobile navigation still exposes a More menu");

  await navigate(client, "/strategies");
  await waitFor(client, "location.pathname === '/' && location.hash === '#analysis' && Boolean(document.querySelector('.a2-shell'))", "Strategies legacy redirect");
  assert(
    await evaluate(client, "document.querySelector('h1')?.textContent === 'Análises'"),
    "Strategies did not redirect to Analyses",
  );

  await client.send("Emulation.clearDeviceMetricsOverride");

  await navigate(client, "/jobs");
  await waitFor(client, "location.pathname === '/' && location.hash === '#dashboard' && Boolean(document.querySelector('.dashboard-shell'))", "Jobs legacy redirect");
  assert(
    await evaluate(client, "document.body.innerText.includes('Seus jogos') && document.body.innerText.includes('Resultados recentes')"),
    "Jobs did not redirect to the central Panel",
  );

  await navigate(client, "/agenda");
  await waitFor(client, "location.pathname === '/' && location.hash === '#dashboard' && Boolean(document.querySelector('.dashboard-shell'))", "Agenda legacy redirect");

  await navigate(client, "/ai");
  await waitFor(client, "location.pathname === '/' && location.hash === '#analysis' && Boolean(document.querySelector('.a2-shell'))", "AI legacy redirect");

  await sleep(200);
  assert(runtimeErrors.length === 0, `Browser runtime exceptions: ${runtimeErrors.join(" | ")}`);
  assert(severeLogs.length === 0, `Browser console errors: ${severeLogs.join(" | ")}`);
  assert(networkErrors.length === 0, `Browser resource/server failures: ${networkErrors.join(" | ")}`);

  console.log("Browser E2E passed: canonical navigation, central Panel, Analyses desktop/mobile and legacy redirects");
} finally {
  client?.close();
  await stopBrowser(browser);
  await cleanupProfile(userDataDir);
}