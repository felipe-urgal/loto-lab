import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3099";
const debugPort = Number(process.env.E2E_MY_GAMES_CHROME_PORT || 9230);

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const candidate of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try { return execFileSync("which", [candidate], { encoding: "utf8" }).trim(); } catch { /* next */ }
  }
  throw new Error("Chrome/Chromium executable was not found on the runner");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function json(path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...(options.headers || {}) } : options.headers,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${response.status} ${path}: ${JSON.stringify(body)}`);
  return body;
}

async function prepareRealBet() {
  const managed = await json("/api/v1/game-batches/manage/mega-sena?scope=active&limit=50");
  const batch = (managed.items || []).find((item) => !item.hasRealBet);
  if (!batch) throw new Error("My Games E2E needs one visible Mega-Sena batch without a real bet");
  const contestNumber = batch.targetContestNumber || 9041;
  await json("/api/v1/real-bets", {
    method: "POST",
    body: JSON.stringify({
      batchId: batch.id,
      contestNumber,
      actualCost: 6,
      gamePositions: [1],
    }),
  });
  return { batchId: batch.id, contestNumber };
}

async function waitForJson(url, attempts = 200) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (error) { lastError = error; }
    await sleep(100);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function waitForProcessExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { child.removeListener("exit", onExit); resolve(false); }, timeoutMs);
    const onExit = () => { clearTimeout(timer); resolve(true); };
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

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }
  async open() {
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
    const list = this.listeners.get(method) || [];
    list.push(listener);
    this.listeners.set(method, list);
  }
  close() { this.socket.close(); }
}

async function createPage() {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Chrome refused a new tab: HTTP ${response.status}`);
  const page = await response.json();
  const client = new CdpClient(page.webSocketDebuggerUrl);
  await client.open();
  return client;
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
  return result.result?.value;
}

async function navigate(client, path) {
  await client.send("Page.navigate", { url: new URL(path, baseUrl).toString() });
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (await evaluate(client, "document.readyState === 'complete'").catch(() => false)) return;
    await sleep(50);
  }
  throw new Error(`Timed out navigating to ${path}`);
}

async function waitFor(client, expression, label, attempts = 240) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await evaluate(client, expression).catch(() => false);
    if (value) return value;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const seeded = await prepareRealBet();
const chrome = findChrome();
const userDataDir = await mkdtemp(join(tmpdir(), "loto-lab-my-games-v2-"));
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
  const serverErrors = [];
  client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => runtimeErrors.push(exceptionDetails?.exception?.description || exceptionDetails?.text || "Runtime exception"));
  client.on("Network.responseReceived", ({ response }) => { if (Number(response?.status || 0) >= 500) serverErrors.push(`${response.status} ${response.url}`); });
  await Promise.all([client.send("Page.enable"), client.send("Runtime.enable"), client.send("Network.enable")]);

  await navigate(client, "/#games");
  await waitFor(client, "Boolean(document.querySelector('[data-my-games-v2]'))", "My Games 2.0 shell");

  const cleanSurface = await evaluate(client, `(() => ({
    subtitle: document.querySelector('#view-subtitle')?.textContent || '',
    filters: [...document.querySelectorAll('[data-mg2-filter]')].map((node) => node.textContent.trim()),
    hasOrganizerCard: document.body.innerText.includes('Organizar lotes'),
    hasDuplicateAction: document.body.innerText.includes('Arquivar duplicados')
  }))()`);
  assert(cleanSurface.subtitle.includes("Acompanhe lotes, apostas e resultados"), `Unexpected My Games subtitle: ${JSON.stringify(cleanSurface)}`);
  assert(cleanSurface.filters.length === 4, `My Games filters are incomplete: ${JSON.stringify(cleanSurface)}`);
  assert(!cleanSurface.hasOrganizerCard && !cleanSurface.hasDuplicateAction, `Legacy management clutter is still visible: ${JSON.stringify(cleanSurface)}`);

  await evaluate(client, "document.querySelector('[data-mg2-filter=\"bets\"]').click(); true");
  await waitFor(client, `Boolean(document.querySelector('[data-mg2-batch="${seeded.batchId}"]'))`, "real-bet batch in Apostados");
  await evaluate(client, `document.querySelector('[data-mg2-toggle="${seeded.batchId}"]').click(); true`);
  await waitFor(client, `!document.querySelector('#mg2-detail-${seeded.batchId}')?.hidden`, "expanded real-bet batch");
  assert(
    await evaluate(client, `Boolean(document.querySelector('[data-mg2-hide="${seeded.batchId}"]'))`),
    "A real-bet batch cannot be hidden from its expanded detail",
  );

  await evaluate(client, `document.querySelector('[data-mg2-hide="${seeded.batchId}"]').click(); true`);
  await waitFor(client, `!document.querySelector('[data-mg2-batch="${seeded.batchId}"]')`, "hidden batch removed from visible list");

  await evaluate(client, "document.querySelector('[data-mg2-filter=\"hidden\"]').click(); true");
  await waitFor(client, `Boolean(document.querySelector('[data-mg2-batch="${seeded.batchId}"]'))`, "batch in Ocultos");
  await evaluate(client, `document.querySelector('[data-mg2-toggle="${seeded.batchId}"]').click(); true`);
  await waitFor(client, `Boolean(document.querySelector('[data-mg2-show="${seeded.batchId}"]'))`, "restore hidden batch action");
  await evaluate(client, `document.querySelector('[data-mg2-show="${seeded.batchId}"]').click(); true`);
  await waitFor(client, `Boolean(document.querySelector('[data-mg2-batch="${seeded.batchId}"]')) && Boolean(document.querySelector('[data-mg2-filter="visible"].is-active'))`, "restored batch back in visible list");

  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await navigate(client, "/#games");
  await waitFor(client, "Boolean(document.querySelector('[data-my-games-v2]'))", "mobile My Games 2.0 shell");
  const mobile = await evaluate(client, `(() => ({
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    firstControlHeight: document.querySelector('[data-mg2-filter]')?.getBoundingClientRect().height || 0,
    searchHeight: document.querySelector('[data-mg2-search]')?.getBoundingClientRect().height || 0
  }))()`);
  assert(mobile.viewport <= 390, `My Games mobile viewport is too wide: ${JSON.stringify(mobile)}`);
  assert(mobile.scrollWidth <= mobile.viewport + 1, `My Games 2.0 overflows horizontally: ${JSON.stringify(mobile)}`);
  assert(mobile.firstControlHeight >= 40, `My Games filter target is too small: ${JSON.stringify(mobile)}`);
  assert(mobile.searchHeight >= 40, `My Games search target is too small: ${JSON.stringify(mobile)}`);

  assert(runtimeErrors.length === 0, `My Games runtime exceptions: ${runtimeErrors.join(" | ")}`);
  assert(serverErrors.length === 0, `My Games server failures: ${serverErrors.join(" | ")}`);
  console.log("My Games 2.0 E2E passed: clean hierarchy, real-bet hide/restore and mobile layout");
} finally {
  client?.close();
  await stopBrowser(browser);
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 }).catch(() => {});
}
