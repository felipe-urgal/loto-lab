import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3099";
const debugPort = Number(process.env.E2E_MY_GAMES_CHROME_PORT || 9230);
const targetContest = 9041;

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

async function seedComparisonHistory() {
  if (!process.env.DATABASE_URL) throw new Error("My Games E2E requires DATABASE_URL");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (let index = 0; index < 60; index += 1) {
      const contestNumber = 9001 + index;
      const numbers = Array.from({ length: 6 }, (_, offset) => ((index * 5 + offset * 7) % 60) + 1)
        .sort((a, b) => a - b);
      const month = String((index % 12) + 1).padStart(2, "0");
      const day = String((index % 27) + 1).padStart(2, "0");
      await pool.query(
        `
          INSERT INTO contests (lottery, contest_number, draw_date, numbers)
          VALUES ('mega-sena', $1, $2, $3)
          ON CONFLICT (lottery, contest_number) DO UPDATE SET
            draw_date = EXCLUDED.draw_date,
            numbers = EXCLUDED.numbers,
            updated_at = NOW()
        `,
        [contestNumber, `2026-${month}-${day}`, numbers],
      );
    }
  } finally {
    await pool.end();
  }
}

async function generateBatch(contestNumber) {
  return json("/api/v1/games/generate", {
    method: "POST",
    body: JSON.stringify({
      lottery: "mega-sena",
      gameCount: 2,
      targetContestNumber: contestNumber,
      generationMode: "deterministic",
      persist: true,
    }),
  });
}

async function prepareFixtures() {
  await seedComparisonHistory();
  const managed = await json("/api/v1/game-batches/manage/mega-sena?scope=active&limit=200");
  let betBatch = (managed.items || []).find((item) => item.targetContestNumber === targetContest && !item.hasRealBet);
  if (!betBatch) {
    const created = await generateBatch(targetContest);
    betBatch = { id: created.batchId, targetContestNumber: targetContest };
  }

  const createdGenerated = await generateBatch(targetContest + 1);
  const generatedBatchId = createdGenerated.batchId;
  if (!generatedBatchId) throw new Error("My Games E2E could not create a generated comparison batch");

  const bet = await json("/api/v1/real-bets", {
    method: "POST",
    body: JSON.stringify({
      batchId: betBatch.id,
      contestNumber: targetContest,
      actualCost: 6,
      gamePositions: [1],
    }),
  });
  if (bet.status !== "checked") throw new Error(`Expected seeded real bet to be checked, got ${bet.status}`);

  const comparison = await json(`/api/v1/game-batches/${generatedBatchId}/comparison?count=5`);
  if (comparison.items?.length !== 5) throw new Error(`Expected five comparison contests, got ${comparison.items?.length}`);
  if (comparison.scope?.financial !== false) throw new Error("Comparison endpoint must explicitly exclude financial accounting");
  const serialized = JSON.stringify(comparison);
  for (const forbidden of ["ticketCost", "totalPrizeValue", "netResult"]) {
    if (serialized.includes(forbidden)) throw new Error(`Comparison endpoint leaked financial field ${forbidden}`);
  }

  return { betBatchId: betBatch.id, generatedBatchId };
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

const seeded = await prepareFixtures();
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

  await evaluate(client, "document.querySelector('[data-mg2-filter=\"generated\"]').click(); true");
  await waitFor(client, `Boolean(document.querySelector('[data-mg2-batch="${seeded.generatedBatchId}"]'))`, "generated batch for comparison");
  await evaluate(client, `document.querySelector('[data-mg2-toggle="${seeded.generatedBatchId}"]').click(); true`);
  await waitFor(client, `!document.querySelector('#mg2-detail-${seeded.generatedBatchId}')?.hidden`, "expanded generated batch");

  const generatedState = await evaluate(client, `(() => {
    const detail = document.querySelector('#mg2-detail-${seeded.generatedBatchId}');
    return {
      hasOfficial: Boolean(detail?.querySelector('[data-mg2-official]')),
      hasLegacyContestInput: Boolean(detail?.querySelector('[data-mg2-contest]')),
      text: detail?.innerText || ''
    };
  })()`);
  assert(!generatedState.hasOfficial, `Generated batch incorrectly shows an official financial result: ${JSON.stringify(generatedState)}`);
  assert(!generatedState.hasLegacyContestInput, `Legacy one-contest checker is still exposed: ${JSON.stringify(generatedState)}`);
  assert(!generatedState.text.includes("Custo R$") && !generatedState.text.includes("Resultado -R$"), `Generated batch still presents hypothetical loss as real money: ${JSON.stringify(generatedState)}`);

  await evaluate(client, `document.querySelector('[data-mg2-compare="${seeded.generatedBatchId}"]').click(); true`);
  await waitFor(client, `document.querySelectorAll('#mg2-detail-${seeded.generatedBatchId} .mg2-compare-contest').length === 5`, "five-contest comparison");
  const comparisonState = await evaluate(client, `(() => {
    const panel = document.querySelector('#mg2-detail-${seeded.generatedBatchId} [data-mg2-comparison]');
    return {
      countButtons: panel?.querySelectorAll('[data-mg2-compare-count]').length || 0,
      active: panel?.querySelector('[data-mg2-compare-count].is-active')?.textContent || '',
      contests: panel?.querySelectorAll('.mg2-compare-contest').length || 0,
      drawNumbers: panel?.querySelectorAll('.mg2-draw-number').length || 0,
      hitBadges: panel?.querySelectorAll('.mg2-compare-hit-summary span').length || 0,
      text: panel?.innerText || ''
    };
  })()`);
  assert(comparisonState.countButtons === 4 && comparisonState.active.trim() === "5", `Comparison count controls are wrong: ${JSON.stringify(comparisonState)}`);
  assert(comparisonState.contests === 5 && comparisonState.drawNumbers > 0 && comparisonState.hitBadges > 0, `Comparison does not expose draws and game hits: ${JSON.stringify(comparisonState)}`);
  assert(!comparisonState.text.includes("Custo real") && !comparisonState.text.includes("Resultado líquido"), `Comparison mixed real financial accounting into simulation: ${JSON.stringify(comparisonState)}`);

  await evaluate(client, `document.querySelector('#mg2-detail-${seeded.generatedBatchId} [data-mg2-compare-count="3"]').click(); true`);
  await waitFor(client, `document.querySelectorAll('#mg2-detail-${seeded.generatedBatchId} .mg2-compare-contest').length === 3`, "three-contest comparison");

  await evaluate(client, "document.querySelector('[data-mg2-filter=\"bets\"]').click(); true");
  await waitFor(client, `Boolean(document.querySelector('[data-mg2-batch="${seeded.betBatchId}"]'))`, "real-bet batch in Apostados");
  await evaluate(client, `document.querySelector('[data-mg2-toggle="${seeded.betBatchId}"]').click(); true`);
  await waitFor(client, `!document.querySelector('#mg2-detail-${seeded.betBatchId}')?.hidden`, "expanded real-bet batch");
  const official = await evaluate(client, `(() => {
    const detail = document.querySelector('#mg2-detail-${seeded.betBatchId}');
    return {
      hasOfficial: Boolean(detail?.querySelector('[data-mg2-official]')),
      officialText: detail?.querySelector('[data-mg2-official]')?.innerText || '',
      hasCompare: Boolean(detail?.querySelector('[data-mg2-compare]')),
      hasHide: Boolean(detail?.querySelector('[data-mg2-hide]'))
    };
  })()`);
  assert(official.hasOfficial && official.officialText.includes("Resultado da aposta") && official.officialText.includes("Custo real"), `Real bet result is not clearly separated: ${JSON.stringify(official)}`);
  assert(official.hasCompare && official.hasHide, `Real-bet actions are incomplete: ${JSON.stringify(official)}`);

  await evaluate(client, `document.querySelector('[data-mg2-hide="${seeded.betBatchId}"]').click(); true`);
  await waitFor(client, `Boolean(document.querySelector('[data-my-games-v2]')) && !document.querySelector('[data-mg2-batch="${seeded.betBatchId}"]')`, "hidden batch removed from visible list");

  await waitFor(client, `Boolean(document.querySelector('[data-mg2-filter="hidden"]'))`, "Ocultos filter after hide");
  await evaluate(client, "document.querySelector('[data-mg2-filter=\"hidden\"]').click(); true");
  await waitFor(client, `Boolean(document.querySelector('[data-my-games-v2]')) && Boolean(document.querySelector('[data-mg2-batch="${seeded.betBatchId}"]'))`, "batch in Ocultos");
  await evaluate(client, `document.querySelector('[data-mg2-toggle="${seeded.betBatchId}"]').click(); true`);
  await waitFor(client, `Boolean(document.querySelector('[data-mg2-show="${seeded.betBatchId}"]'))`, "restore hidden batch action");
  await evaluate(client, `document.querySelector('[data-mg2-show="${seeded.betBatchId}"]').click(); true`);
  await waitFor(client, `Boolean(document.querySelector('[data-mg2-batch="${seeded.betBatchId}"]')) && Boolean(document.querySelector('[data-mg2-filter="visible"].is-active'))`, "restored batch back in visible list");

  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await navigate(client, "/#games");
  await waitFor(client, "Boolean(document.querySelector('[data-my-games-v2]'))", "mobile My Games 2.0 shell");
  await evaluate(client, "document.querySelector('[data-mg2-filter=\"generated\"]').click(); true");
  await waitFor(client, `Boolean(document.querySelector('[data-mg2-batch="${seeded.generatedBatchId}"]'))`, "mobile generated batch");
  await evaluate(client, `document.querySelector('[data-mg2-toggle="${seeded.generatedBatchId}"]').click(); true`);
  await waitFor(client, `Boolean(document.querySelector('[data-mg2-compare="${seeded.generatedBatchId}"]'))`, "mobile comparison action");
  await evaluate(client, `document.querySelector('[data-mg2-compare="${seeded.generatedBatchId}"]').click(); true`);
  await waitFor(client, `document.querySelectorAll('#mg2-detail-${seeded.generatedBatchId} .mg2-compare-contest').length === 5`, "mobile comparison panel");

  const mobile = await evaluate(client, `(() => ({
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    firstControlHeight: document.querySelector('[data-mg2-filter]')?.getBoundingClientRect().height || 0,
    searchHeight: document.querySelector('[data-mg2-search]')?.getBoundingClientRect().height || 0,
    comparisonWidth: document.querySelector('[data-mg2-comparison]')?.getBoundingClientRect().width || 0
  }))()`);
  assert(mobile.viewport <= 390, `My Games mobile viewport is too wide: ${JSON.stringify(mobile)}`);
  assert(mobile.scrollWidth <= mobile.viewport + 1, `My Games 2.0 overflows horizontally: ${JSON.stringify(mobile)}`);
  assert(mobile.firstControlHeight >= 40, `My Games filter target is too small: ${JSON.stringify(mobile)}`);
  assert(mobile.searchHeight >= 40, `My Games search target is too small: ${JSON.stringify(mobile)}`);
  assert(mobile.comparisonWidth > 0 && mobile.comparisonWidth <= mobile.viewport, `Comparison panel is not mobile-safe: ${JSON.stringify(mobile)}`);

  assert(runtimeErrors.length === 0, `My Games runtime exceptions: ${runtimeErrors.join(" | ")}`);
  assert(serverErrors.length === 0, `My Games server failures: ${serverErrors.join(" | ")}`);
  console.log("My Games 2.1 E2E passed: generated-vs-real separation, 3/5 contest comparison, hide/restore and mobile layout");
} finally {
  client?.close();
  await stopBrowser(browser);
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 }).catch(() => {});
}
