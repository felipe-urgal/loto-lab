import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3099";
const debugPort = Number(process.env.E2E_ANALYSIS_CHROME_PORT || 9224);
const lotteries = [
  { id: "mega-sena", numberCount: 60 },
  { id: "lotofacil", numberCount: 25 },
  { id: "dia-de-sorte", numberCount: 31 },
];

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const candidate of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try {
      return execFileSync("which", [candidate], { encoding: "utf8" }).trim();
    } catch {
      // Try the next executable name.
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
    await rm(path, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 });
  } catch (error) {
    console.warn(`Could not fully remove Chrome analysis profile ${path}:`, error);
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
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
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const value = await evaluate(client, expression).catch(() => false);
    if (value) return value;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const chrome = findChrome();
const userDataDir = await mkdtemp(join(tmpdir(), "loto-lab-analysis-lotteries-"));
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

  client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    runtimeErrors.push(exceptionDetails?.exception?.description || exceptionDetails?.text || "Runtime exception");
  });
  client.on("Network.responseReceived", ({ response }) => {
    if (Number(response?.status || 0) >= 500) serverErrors.push(`${response.status} ${response.url}`);
  });
  await Promise.all([
    client.send("Page.enable"),
    client.send("Runtime.enable"),
    client.send("Network.enable"),
  ]);

  await navigate(client, "/#analysis");
  await waitFor(client, "Boolean(document.querySelector('.a2-shell'))", "initial Analyses 2.0 shell");
  await waitFor(client, "document.querySelector('[data-a2-tab]')?.textContent?.includes('Classificação')", "Portuguese analysis labels");

  const readability = await evaluate(client, `({
    brand: document.querySelector('.brand-copy small')?.textContent?.trim(),
    navDashboard: [...document.querySelectorAll('[data-nav-key] .nav-label')].some((node) => node.textContent.trim() === 'Painel'),
    tabFont: parseFloat(getComputedStyle(document.querySelector('[data-a2-tab]')).fontSize),
    helperFont: parseFloat(getComputedStyle(document.querySelector('.a2-panel-head span')).fontSize),
    subtitleFont: parseFloat(getComputedStyle(document.querySelector('.topbar-copy p')).fontSize),
    hasEnglishRanking: [...document.querySelectorAll('[data-a2-tab]')].some((node) => node.textContent.trim() === 'Ranking')
  })`);
  assert(readability.brand === "Console de estratégias", `Brand subtitle was not translated: ${readability.brand}`);
  assert(readability.navDashboard, "Dashboard navigation label was not translated to Painel");
  assert(!readability.hasEnglishRanking, "Analysis tab still exposes Ranking in English");
  assert(readability.tabFont >= 13, `Analysis tab font is still too small: ${readability.tabFont}px`);
  assert(readability.helperFont >= 12, `Analysis helper font is still too small: ${readability.helperFont}px`);
  assert(readability.subtitleFont >= 13, `Topbar subtitle font is still too small: ${readability.subtitleFont}px`);

  for (const lottery of lotteries) {
    await evaluate(client, `(() => {
      const select = document.querySelector('#lottery-select');
      select.value = ${JSON.stringify(lottery.id)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);

    await waitFor(
      client,
      `(() => {
        const uniqueNumbers = new Set([...document.querySelectorAll('[data-a2-number]')].map((node) => node.dataset.a2Number));
        return document.querySelector('#lottery-select')?.value === ${JSON.stringify(lottery.id)} && uniqueNumbers.size === ${lottery.numberCount};
      })()`,
      `${lottery.id} advanced ranking`,
    );

    const state = await evaluate(client, `(() => {
      const uniqueNumbers = new Set([...document.querySelectorAll('[data-a2-number]')].map((node) => node.dataset.a2Number));
      return {
        fallback: Boolean(document.querySelector('[data-analysis-v2-fallback]')),
        principle: document.body.innerText.includes('Observado × esperado'),
        numberCount: uniqueNumbers.size,
        tabs: document.querySelectorAll('[data-a2-tab]').length
      };
    })()`);
    assert(!state.fallback, `${lottery.id} fell back instead of mounting advanced analyses`);
    assert(state.principle, `${lottery.id} is missing the observed-vs-expected principle`);
    assert(state.numberCount === lottery.numberCount, `${lottery.id} rendered ${state.numberCount} unique ranking numbers`);
    assert(state.tabs === 5, `${lottery.id} did not render all five analysis modes`);
  }

  const pageChecks = [
    {
      path: "/jobs",
      ready: "Boolean(document.querySelector('#job-form'))",
      required: ["Console de estratégias", "Janela histórica", "Bloco", "Teste histórico"],
      forbidden: ["Strategy console", "Lookback", "Bucket"],
    },
    {
      path: "/strategies",
      ready: "Boolean(document.querySelector('#strategy-form'))",
      required: ["Console de estratégias", "Identificador", "Janela histórica do Laboratório", "Bloco do Laboratório"],
      forbidden: ["Strategy console", "Slug", "Lookback Lab", "Bucket Lab"],
    },
    {
      path: "/ai",
      ready: "Boolean(document.querySelector('#ai-form'))",
      required: ["Console de estratégias", "teste histórico", "Registros anteriores"],
      forbidden: ["Strategy console", "Snapshots anteriores"],
    },
    {
      path: "/lab",
      ready: "Boolean(document.querySelector('#lab-form'))",
      required: ["Console de estratégias", "Classificação do período"],
      forbidden: ["Strategy console", "Ranking do período"],
    },
    {
      path: "/agenda",
      ready: "Boolean(document.querySelector('#agenda-grid'))",
      required: ["Console de estratégias"],
      forbidden: ["Strategy console"],
    },
  ];

  for (const check of pageChecks) {
    await navigate(client, check.path);
    await waitFor(client, check.ready, `${check.path} shell`);
    await waitFor(client, `document.body.innerText.includes(${JSON.stringify(check.required[0])})`, `${check.path} localization`);
    const bodyText = await evaluate(client, "document.body.innerText");
    for (const expected of check.required) assert(bodyText.includes(expected), `${check.path} is missing translated text: ${expected}`);
    for (const forbidden of check.forbidden) assert(!bodyText.includes(forbidden), `${check.path} still exposes English text: ${forbidden}`);
  }

  assert(runtimeErrors.length === 0, `Browser runtime exceptions: ${runtimeErrors.join(" | ")}`);
  assert(serverErrors.length === 0, `Browser API/server failures: ${serverErrors.join(" | ")}`);
  console.log("Analysis/UI E2E passed: three lotteries, readable typography and Portuguese UI");
} finally {
  client?.close();
  await stopBrowser(browser);
  await cleanupProfile(userDataDir);
}
