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
  await waitFor(client, "Boolean(document.querySelector('.a2-shell'))", "Analyses 2.0 shell");
  const analysisTabs = await evaluate(client, `[...document.querySelectorAll('[data-a2-tab]')].map((node) => node.textContent.trim())`);
  assert(analysisTabs.length === 5, "Analyses 2.0 did not render five modes");
  assert(
    ["Classificação", "Estrutura", "Dinâmica", "Combinações", "Validação"].every((label) => analysisTabs.includes(label)),
    "Analyses 2.0 is missing one or more modes",
  );
  assert(
    await evaluate(client, "document.querySelector('.a2-tabs')?.getAttribute('role') === 'tablist'"),
    "Analyses 2.0 tablist semantics are missing",
  );
  assert(
    await evaluate(client, "document.body.innerText.includes('Observado × esperado')"),
    "Analyses 2.0 is missing the observed-vs-expected principle",
  );
  await evaluate(client, "document.querySelector('[data-a2-tab=structure]').click(); true");
  await waitFor(client, "document.body.innerText.includes('Histórico esperado')", "transition-matched structure baseline");
  await evaluate(client, "document.querySelector('[data-a2-tab=validation]').click(); true");
  await waitFor(client, "document.body.innerText.includes('Teste fora da amostra')", "rolling validation analysis");
  assert(
    await evaluate(client, "document.body.innerText.includes('Sensibilidade dos pesos')"),
    "Analyses 2.0 is missing weight-sensitivity validation",
  );
  await evaluate(client, "document.querySelector('[data-a2-tab=ranking]').click(); true");
  await waitFor(client, "Boolean(document.querySelector('[data-a2-number]'))", "auditable ranking numbers");
  await evaluate(client, "document.querySelector('[data-a2-number]').click(); true");
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
    const tabs = document.querySelector('.a2-tabs');
    const firstNumber = document.querySelector('[data-a2-number]');
    return {
      width: document.documentElement.clientWidth,
      mobileBreakpoint: matchMedia('(max-width: 680px)').matches,
      tabsVisible: Boolean(tabs && getComputedStyle(tabs).display !== 'none'),
      firstNumberVisible: Boolean(firstNumber && firstNumber.getBoundingClientRect().width > 0)
    };
  })()`);
  assert(mobileAnalysis.mobileBreakpoint, `Analyses responsive breakpoint was not active: ${JSON.stringify(mobileAnalysis)}`);
  assert(mobileAnalysis.width <= 390, `Analyses responsive viewport is wider than expected: ${JSON.stringify(mobileAnalysis)}`);
  assert(mobileAnalysis.tabsVisible, "Analyses tabs are not visible on mobile");
  assert(mobileAnalysis.firstNumberVisible, "Analyses ranking numbers are not visible on mobile");
  await evaluate(client, "document.querySelector('[data-a2-number]').click(); true");
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

  await navigate(client, "/strategies");
  await waitFor(client, "Boolean(document.querySelector('#strategy-form'))", "strategies form");
  assert(await evaluate(client, "document.querySelector('h1')?.textContent === 'Estratégias'"), "Strategies page identity mismatch");

  await sleep(120);
  const mobileMoreVisible = await evaluate(client, `(() => {
    const button = document.querySelector('[data-nav-more]');
    return button && getComputedStyle(button).display !== 'none';
  })()`);
  assert(mobileMoreVisible, "Mobile More navigation is not visible at 390px");
  await evaluate(client, "document.querySelector('[data-nav-more]').click(); true");
  const menu = await evaluate(client, `(() => {
    const panel = document.querySelector('[data-nav-more-menu]');
    return { hidden: panel?.hidden, text: panel?.innerText || '' };
  })()`);
  assert(menu.hidden === false, "Mobile More panel did not open");
  assert(menu.text.includes("Estratégias") && menu.text.includes("Execuções"), "Mobile More panel is missing new operational pages");

  await client.send("Emulation.clearDeviceMetricsOverride");
  await navigate(client, "/jobs");
  await waitFor(client, "Boolean(document.querySelector('#job-form'))", "jobs form");
  assert(await evaluate(client, "document.querySelector('h1')?.textContent === 'Execuções'"), "Jobs page identity mismatch");
  assert(await evaluate(client, "Boolean(document.querySelector('#job-strategy'))"), "Jobs strategy-version selector is missing");

  await navigate(client, "/agenda");
  await waitFor(client, "Boolean(document.querySelector('#agenda-grid'))", "agenda root");
  assert(await evaluate(client, "document.querySelector('h1')?.textContent === 'Agenda'"), "Agenda page identity mismatch");

  await navigate(client, "/ai");
  await waitFor(client, "Boolean(document.querySelector('#ai-form'))", "AI form");
  assert(await evaluate(client, "Boolean(document.querySelector('#ai-force'))"), "AI explicit refresh control is missing");

  await sleep(200);
  assert(runtimeErrors.length === 0, `Browser runtime exceptions: ${runtimeErrors.join(" | ")}`);
  assert(severeLogs.length === 0, `Browser console errors: ${severeLogs.join(" | ")}`);
  assert(networkErrors.length === 0, `Browser resource/server failures: ${networkErrors.join(" | ")}`);

  console.log("Browser E2E passed: main, hardened Analyses 2.0 desktop/mobile, dialog cleanup, strategies, mobile nav, jobs, agenda and AI");
} finally {
  client?.close();
  await stopBrowser(browser);
  await cleanupProfile(userDataDir);
}