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

async function waitForJson(url, attempts = 80) {
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

  // Empty-state API 404s are part of the product contract (for example when a
  // lottery has no stored latest contest yet). Server errors must still fail.
  if (isApi) return status >= 500 ? `${status} API ${url.pathname}` : undefined;

  // Documents, scripts, styles, icons and every other first-party asset must
  // never fail to load during the real-browser smoke flow.
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
  assert(home.text.includes("Dashboard"), "Main application rendered no meaningful navigation content");

  await navigate(client, "/strategies");
  await waitFor(client, "Boolean(document.querySelector('#strategy-form'))", "strategies form");
  assert(await evaluate(client, "document.querySelector('h1')?.textContent === 'Estratégias'"), "Strategies page identity mismatch");

  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
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

  console.log("Browser E2E passed: main, strategies, mobile nav, jobs, agenda and AI");
} finally {
  client?.close();
  await stopBrowser(browser);
  await cleanupProfile(userDataDir);
}
