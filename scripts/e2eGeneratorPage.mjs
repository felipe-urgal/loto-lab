import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3099";
const debugPort = Number(process.env.E2E_GENERATOR_CHROME_PORT || 9228);
const lotteries = [
  { id: "mega-sena", max: 60, drawSize: 6, step: 11, fixedCount: 3 },
  { id: "lotofacil", max: 25, drawSize: 15, step: 2, fixedCount: 8 },
  { id: "dia-de-sorte", max: 31, drawSize: 7, step: 4, fixedCount: 3 },
];
const luckyMonths = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const candidate of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try { return execFileSync("which", [candidate], { encoding: "utf8" }).trim(); } catch { /* next */ }
  }
  throw new Error("Chrome/Chromium executable was not found on the runner");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function seedGeneratorHistory() {
  if (!process.env.DATABASE_URL) throw new Error("Generator E2E requires DATABASE_URL");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const lottery of lotteries) {
      for (let index = 0; index < 40; index += 1) {
        const contestNumber = 9001 + index;
        const numbers = Array.from(
          { length: lottery.drawSize },
          (_, offset) => ((index * 3 + offset * lottery.step) % lottery.max) + 1,
        ).sort((a, b) => a - b);
        const month = String((index % 12) + 1).padStart(2, "0");
        const day = String((index % 27) + 1).padStart(2, "0");
        await pool.query(
          `
            INSERT INTO contests (lottery, contest_number, draw_date, numbers, lucky_month)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (lottery, contest_number) DO UPDATE SET
              draw_date = EXCLUDED.draw_date,
              numbers = EXCLUDED.numbers,
              lucky_month = EXCLUDED.lucky_month,
              updated_at = NOW()
          `,
          [
            lottery.id,
            contestNumber,
            `2025-${month}-${day}`,
            numbers,
            lottery.id === "dia-de-sorte" ? luckyMonths[index % luckyMonths.length] : null,
          ],
        );
      }
    }
  } finally {
    await pool.end();
  }
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

await seedGeneratorHistory();
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 390, height: 844 },
];
const MIN_CONTROL_PX = 44;
const MIN_FONT_PX = 16;
const userDataDir = await mkdtemp(join(tmpdir(), "loto-lab-playground-"));
const browser = spawn(findChrome(), [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userDataDir}`,
  "--no-first-run", "--no-default-browser-check", "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });
let client;
try {
  await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  client = await createPage();
  const runtimeErrors = [];
  const serverErrors = [];
  client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => runtimeErrors.push(exceptionDetails?.text || "Runtime exception"));
  client.on("Network.responseReceived", ({ response }) => {
    if (response.status >= 500) serverErrors.push(`${response.status} ${response.url}`);
  });
  await Promise.all([client.send("Page.enable"), client.send("Runtime.enable"), client.send("Network.enable")]);
  client.on("Fetch.requestPaused", async ({ requestId }) => {
    await client.send("Fetch.fulfillRequest", { requestId, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify({ status: "success", finishedAt: new Date().toISOString() })).toString("base64"),
    });
  });
  for (const viewport of viewports) {
    await client.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
    await navigate(client, "/#generate");
    await waitFor(client, "!!document.querySelector('[data-g2-shell]') && document.querySelectorAll('.recent-row').length === 3", `${viewport.name} generator and recent results`);
    assert(await evaluate(client, "!document.querySelector('[data-g2-customize]').open"), "Customization must start collapsed");
    assert(await evaluate(client, "!document.querySelector('nav, aside, [data-g2-save], [data-g2-flow-step]')"), "Generator must have one direct flow");
    for (const lottery of lotteries) {
      await evaluate(client, `(() => {
        const select = document.querySelector('#lottery-select');
        select.value = ${JSON.stringify(lottery.id)};
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await waitFor(client, `document.querySelector('#lottery-select')?.value === ${JSON.stringify(lottery.id)} && document.querySelectorAll('[data-g2-number]').length === ${lottery.max} && document.querySelector('#recent-modality')?.textContent`, `${lottery.id} controls`);
      await evaluate(client, `(() => {
        document.querySelector('[data-g2-customize] summary').click();
        document.querySelector('[data-g2-number="7"]').click();
        document.querySelector('[data-g2-number="18"]').click();
        document.querySelector('[data-g2-selection-mode="exclude"]').click();
        document.querySelector('[data-g2-number="1"]').click();
        const count = document.querySelector('#g2-game-count');
        count.value = '2'; count.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await waitFor(client, "document.querySelector('[data-g2-preview]')?.disabled === false", "conditioned plan");
      await evaluate(client, "document.querySelector('[data-g2-preview]').click()");
      await waitFor(client, "document.querySelectorAll('.g2-game').length === 2", "two generated games");
      const games = await evaluate(client, "[...document.querySelectorAll('.g2-game')].map(row => [...row.querySelectorAll('.ball')].map(ball => Number(ball.textContent.trim())))");
      assert(games.every(game => game.length === lottery.drawSize && game.includes(7) && game.includes(18) && !game.includes(1)), `${lottery.id}: selections/cardinality must be honored`);
      assert(await evaluate(client, "document.querySelectorAll('.ball.is-fixed').length === 4"), "Only manual numbers are marked fixed");
      assert(await evaluate(client, "!!document.querySelector('[data-g2-copy]')"), "Copy must be available after generation");
      assert(await evaluate(client, "document.querySelectorAll('.recent-row').length === 3"), "Exactly three recent contests");
      if (lottery.id === "mega-sena") {
        const beforeSync = await evaluate(client, "document.querySelector('.g2-game-grid').textContent");
        await client.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/v1/operations/sync", requestStage: "Request" }] });
        await evaluate(client, "document.querySelector('#sync-results').click()");
        await waitFor(client, "document.querySelector('#sync-status').textContent === 'Resultados sincronizados!' && !document.querySelector('[data-g2-preview]').disabled", "sync and refreshed plan");
        assert(await evaluate(client, "document.querySelector('.g2-game-grid')?.textContent") === beforeSync, "Sync must preserve generated games for copying");
        await client.send("Fetch.disable");
      }
      const overflow = await evaluate(client, "document.documentElement.scrollWidth > innerWidth + 1");
      assert(!overflow, `${viewport.name}: document overflow`);
      const controls = await evaluate(client, `Array.from(document.querySelectorAll('button, select, input[type=number], summary')).filter(el => el.getClientRects().length && !el.closest('details:not([open]) > :not(summary)')).filter(el => { const r = el.getBoundingClientRect(); return r.width < ${MIN_CONTROL_PX} - 1 || r.height < ${MIN_CONTROL_PX} - 1; }).map(el => el.id || el.outerHTML.slice(0, 100))`);
      assert(!controls.length, `${viewport.name}: controls below minimum size ${controls.join(', ')}`);
      const smallText = await evaluate(client, `Array.from(document.querySelectorAll('label, button, input, select, summary')).filter(el => el.getClientRects().length).filter(el => parseFloat(getComputedStyle(el).fontSize) < ${MIN_FONT_PX}).map(el => el.id || el.tagName)`);
      assert(!smallText.length, `${viewport.name}: functional text below 16px`);
      await evaluate(client, "document.querySelector('[data-g2-customize] summary').click()");
    }
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    assert(await evaluate(client, "document.activeElement !== document.body && getComputedStyle(document.activeElement).outlineStyle !== 'none'"), "Keyboard focus must be visible");
    await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    assert(await evaluate(client, "getComputedStyle(document.querySelector('.hero-art')).animationName === 'none'"), "Reduced motion must disable decorative animation");
    assert(await evaluate(client, "!!document.querySelector('[data-g2-result][aria-live=polite]') && !!document.querySelector('#sync-status[role=status]')"), "Async feedback must be announced");
    console.log(`generator browser E2E ok: ${viewport.name}`);
  }
  assert(!runtimeErrors.length, `Uncaught browser exceptions: ${runtimeErrors.join('; ')}`);
  assert(!serverErrors.length, `Server failures: ${serverErrors.join('; ')}`);
} finally {
  client?.close();
  await stopBrowser(browser);
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 });
}
