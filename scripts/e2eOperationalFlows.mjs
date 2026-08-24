import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3099";
const debugPort = Number(process.env.E2E_OPERATIONAL_CHROME_PORT || 9227);

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const candidate of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try {
      return execFileSync("which", [candidate], { encoding: "utf8" }).trim();
    } catch {
      // Try next browser.
    }
  }
  throw new Error("Chrome/Chromium executable was not found on the runner");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    if (this.socket.readyState !== WebSocket.OPEN) {
      await new Promise((resolve, reject) => {
        this.socket.addEventListener("open", resolve, { once: true });
        this.socket.addEventListener("error", reject, { once: true });
      });
    }
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function page() {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Chrome refused a new tab: HTTP ${response.status}`);
  const target = await response.json();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.open();
  await Promise.all([client.send("Page.enable"), client.send("Runtime.enable")]);
  return client;
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Browser evaluation failed");
  return result.result?.value;
}

async function navigate(client, path) {
  await client.send("Page.navigate", { url: new URL(path, baseUrl).toString() });
  await waitFor(client, "document.readyState === 'complete'", `navigation ${path}`);
}

async function waitFor(client, expression, label, attempts = 240) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await evaluate(client, expression).catch(() => false);
    if (value) return value;
    await sleep(125);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const profile = await mkdtemp(join(tmpdir(), "loto-lab-operational-e2e-"));
const browser = spawn(findChrome(), [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--no-default-browser-check",
  "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });

let client;
try {
  await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  client = await page();

  await navigate(client, "/lab");
  await waitFor(client, "Boolean(document.querySelector('#lab-form') && document.querySelector('#lab-experiment'))", "Lab controls");
  await evaluate(client, `(() => {
    document.querySelector('#lab-lottery').value = 'mega-sena';
    document.querySelector('#lab-experiment').value = 'fixed-core';
    document.querySelector('#lab-games').value = '1';
    document.querySelector('#lab-warmup').value = '20';
    document.querySelector('#lab-lookback').value = '50';
    document.querySelector('#lab-bucket').value = '10';
    document.querySelector('#lab-random-samples').value = '100';
    document.querySelector('#lab-form').requestSubmit();
    return true;
  })()`);
  await waitFor(
    client,
    "document.querySelector('#lab-results')?.hidden === false && document.querySelectorAll('#lab-ranking > *').length > 0",
    "completed Strategy Lab comparison",
    480,
  );
  assert(
    await evaluate(client, "document.querySelector('#lab-period-copy')?.textContent.includes('100 controles aleatórios')"),
    "Lab did not render the executed benchmark configuration",
  );

  await navigate(client, "/jobs");
  await waitFor(client, "Boolean(document.querySelector('#job-form') && document.querySelector('#jobs-list'))", "Jobs controls");
  const latestContest = await evaluate(client, `fetch('/api/v1/contests/mega-sena/latest').then(r => r.json()).then(x => x.number)`);
  assert(Number.isInteger(latestContest), "Jobs flow could not resolve latest Mega-Sena contest");
  await evaluate(client, `(() => {
    document.querySelector('#job-kind').value = 'backtest';
    document.querySelector('#job-kind').dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#job-lottery').value = 'mega-sena';
    document.querySelector('#job-games').value = '1';
    document.querySelector('#job-warmup').value = '1';
    document.querySelector('#job-start').value = '${latestContest}';
    document.querySelector('#job-end').value = '${latestContest}';
    document.querySelector('#job-form').requestSubmit();
    return true;
  })()`);
  const jobId = await waitFor(
    client,
    `Number(document.querySelector('#jobs-list [data-job-id]')?.dataset.jobId || 0)`,
    "enqueued analysis job",
  );
  assert(jobId > 0, "Jobs UI did not enqueue an analysis job");

  const cancelSelector = `[data-job-id="${jobId}"] [data-cancel-job]`;
  const canCancel = await evaluate(client, `Boolean(document.querySelector(${JSON.stringify(cancelSelector)}))`);
  if (canCancel) {
    await evaluate(client, `document.querySelector(${JSON.stringify(cancelSelector)}).click(); true`);
  }
  await waitFor(
    client,
    `(() => {
      const card = document.querySelector('[data-job-id="${jobId}"]');
      const status = card?.querySelector('.status-pill')?.textContent?.trim();
      return ['cancelada', 'concluída', 'falhou'].includes(status);
    })()`,
    "terminal analysis job state",
  );

  await navigate(client, "/ai");
  await waitFor(client, "Boolean(document.querySelector('#ai-form') && document.querySelector('#ai-run'))", "AI controls");
  await waitFor(
    client,
    "document.querySelector('#ai-provider-status')?.textContent.includes('OpenAI')",
    "AI provider status",
  );
  const aiState = await evaluate(client, `({
    configuredText: document.querySelector('#ai-provider-status')?.textContent || '',
    disabled: Boolean(document.querySelector('#ai-run')?.disabled)
  })`);
  if (aiState.configuredText.includes("não configurada")) {
    assert(aiState.disabled, "AI generate action must be disabled when provider is not configured");
  }

  await navigate(client, "/#games");
  await waitFor(client, "Boolean(document.querySelector('[data-my-games-v2]'))", "My Games 2.0");
  const targetLock = await evaluate(client, `(() => {
    const button = document.querySelector('[data-mg2-mark-bet]');
    if (!button) return { available: false };
    button.click();
    const form = document.querySelector('[data-mg2-bet-form]');
    const input = form?.querySelector('input[name="contestNumber"]');
    if (!form || !input || !input.value) return { available: false };
    return { available: true, readOnly: input.readOnly, min: input.min, max: input.max, value: input.value, note: form.querySelector('.mg2-form-note')?.textContent || '' };
  })()`);
  if (targetLock.available) {
    assert(targetLock.readOnly, "A generated target contest must be read-only when marking a real bet");
    assert(targetLock.min === targetLock.value && targetLock.max === targetLock.value, "Target contest bounds must be exact");
    assert(targetLock.note.includes("exatamente"), "Real-bet target note must explain exact auditability binding");
  }

  console.log(`Operational browser E2E passed: Lab execution, job #${jobId}, AI status and real-bet target guard`);
} finally {
  client?.close();
  if (browser.exitCode === null && browser.signalCode === null) browser.kill("SIGTERM");
  await sleep(250);
  if (browser.exitCode === null && browser.signalCode === null) browser.kill("SIGKILL");
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined);
}
