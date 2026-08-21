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

const chrome = findChrome();
const userDataDir = await mkdtemp(join(tmpdir(), "loto-lab-generator-v2-"));
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

  await navigate(client, "/#generate");

  for (const lottery of lotteries) {
    await evaluate(client, `(() => {
      const select = document.querySelector('#lottery-select');
      select.value = ${JSON.stringify(lottery.id)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await waitFor(client, `document.querySelector('#lottery-select')?.value === ${JSON.stringify(lottery.id)} && Boolean(document.querySelector('.g2-shell'))`, `${lottery.id} Generator 2.0 shell`);
    await waitFor(client, `document.querySelectorAll('[data-g2-number]').length === ${lottery.max}`, `${lottery.id} number grid`);

    const beforeCount = await evaluate(client, `(async () => {
      const response = await fetch('/api/v1/game-batches/${lottery.id}?limit=200');
      const body = await response.json();
      return (body.items || []).length;
    })()`);

    if (lottery.id === "mega-sena") {
      await evaluate(client, `(() => {
        document.querySelector('[data-g2-selection-mode="fix"]').click();
        for (const value of [1,2,3]) document.querySelector('[data-g2-number="' + value + '"]').click();
        document.querySelector('[data-g2-selection-mode="exclude"]').click();
        document.querySelector('[data-g2-number="60"]').click();
        return true;
      })()`);
      await waitFor(client, "document.querySelector('[data-g2-number=\"60\"]')?.classList.contains('is-excluded')", "exclude after full manual core");
      const manualCore = await evaluate(client, "document.querySelectorAll('[data-g2-number].is-fixed').length");
      assert(manualCore === 3, `Mega-Sena manual core regression: expected 3, got ${manualCore}`);
    } else {
      await evaluate(client, `(() => {
        document.querySelector('[data-g2-selection-mode="fix"]').click();
        document.querySelector('[data-g2-number="1"]').click();
        document.querySelector('[data-g2-selection-mode="exclude"]').click();
        document.querySelector('[data-g2-number="${lottery.max}"]').click();
        return true;
      })()`);
    }

    await sleep(450);
    await evaluate(client, `(() => {
      const odd = document.querySelector('[data-g2-filter-toggle="odd"]');
      if (!odd.checked) odd.click();
      return true;
    })()`);
    await sleep(450);
    await waitFor(client, "!document.querySelector('[data-g2-preview]')?.disabled", `${lottery.id} eligible preview`);

    const antiLeakage = await evaluate(client, `(() => ({
      hasTieredNumbers: document.querySelectorAll('.g2-number.is-strong,.g2-number.is-balanced,.g2-number.is-cold').length > 0,
      funnel: document.querySelector('[data-g2-plan]')?.innerText || '',
      baseline: document.querySelector('[data-g2-baseline]')?.innerText || '',
      target: Number(document.querySelector('#g2-target')?.value || 0)
    }))()`);
    assert(antiLeakage.hasTieredNumbers, `${lottery.id} has no target-scoped number tiers`);
    assert(antiLeakage.target === 9041, `${lottery.id} did not use the deterministic target #9041: ${JSON.stringify(antiLeakage)}`);
    assert(antiLeakage.funnel.includes("Pool explorado pelo motor"), `${lottery.id} does not expose algorithm space`);
    assert(antiLeakage.baseline.includes("Baseline condicionado"), `${lottery.id} does not expose conditioned baseline`);

    await evaluate(client, "document.querySelector('[data-g2-preview]').click(); true");
    await waitFor(client, "Boolean(document.querySelector('.g2-preview'))", `${lottery.id} auditable preview`, 400);
    const preview = await evaluate(client, `(() => ({
      games: [...document.querySelectorAll('.g2-game')].map((game) => [...game.querySelectorAll('.ball')].map((node) => node.textContent.trim()).join('-')).sort().join('|'),
      seed: document.querySelectorAll('.g2-seed code')[0]?.textContent || '',
      previewId: document.querySelectorAll('.g2-seed code')[1]?.textContent || ''
    }))()`);
    assert(preview.seed.length > 8, `${lottery.id} preview has no seed`);
    assert(preview.previewId.length === 64, `${lottery.id} preview has no SHA-256 preview id`);

    const afterPreviewCount = await evaluate(client, `(async () => {
      const response = await fetch('/api/v1/game-batches/${lottery.id}?limit=200');
      const body = await response.json();
      return (body.items || []).length;
    })()`);
    assert(afterPreviewCount === beforeCount, `${lottery.id} preview was persisted before user approval`);

    await evaluate(client, "document.querySelector('[data-g2-save]').click(); true");
    const savedText = await waitFor(client, "document.querySelector('[data-g2-saved]:not([hidden])')?.textContent || false", `${lottery.id} saved preview`, 300);
    const match = String(savedText).match(/Lote #(\d+)/);
    assert(match, `${lottery.id} save did not expose a batch id: ${savedText}`);
    const batchId = Number(match[1]);

    const persisted = await evaluate(client, `(async () => {
      const response = await fetch('/api/v1/game-batches/id/${batchId}');
      const body = await response.json();
      return (body.games || []).map((game) => game.numbers.map((value) => String(value).padStart(2, '0')).join('-')).sort().join('|');
    })()`);
    assert(persisted === preview.games, `${lottery.id} saved games differ from the audited preview`);

    await evaluate(client, "location.hash = 'games'; true");
    await waitFor(client, `document.body.innerText.includes('Lote #${batchId}')`, `${lottery.id} saved batch in My Games`);
    await evaluate(client, "location.hash = 'generate'; true");
    await waitFor(client, `document.querySelector('#lottery-select')?.value === ${JSON.stringify(lottery.id)} && Boolean(document.querySelector('.g2-shell'))`, `${lottery.id} return to generator`);
  }

  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await navigate(client, "/#generate");
  await waitFor(client, "Boolean(document.querySelector('.g2-shell'))", "mobile Generator 2.0 shell");
  const mobile = await evaluate(client, `(() => ({
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    numberWidth: document.querySelector('[data-g2-number]')?.getBoundingClientRect().width || 0,
    previewVisible: Boolean(document.querySelector('[data-g2-preview]'))
  }))()`);
  assert(mobile.viewport <= 390, `Generator mobile viewport is wider than expected: ${JSON.stringify(mobile)}`);
  assert(mobile.scrollWidth <= mobile.viewport + 1, `Generator 2.0 overflows horizontally on mobile: ${JSON.stringify(mobile)}`);
  assert(mobile.numberWidth >= 44, `Generator number target is too small on mobile: ${JSON.stringify(mobile)}`);
  assert(mobile.previewVisible, "Generator preview action disappeared on mobile");

  assert(runtimeErrors.length === 0, `Generator browser runtime exceptions: ${runtimeErrors.join(" | ")}`);
  assert(serverErrors.length === 0, `Generator browser server failures: ${serverErrors.join(" | ")}`);
  console.log("Generator 2.0 E2E passed: three lotteries, target-scoped tiers, explicit fix/exclude, frozen preview, exact save and mobile layout");
} finally {
  client?.close();
  await stopBrowser(browser);
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 }).catch(() => {});
}
