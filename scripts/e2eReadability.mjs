import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3099";
const debugPort = Number(process.env.E2E_READABILITY_CHROME_PORT || 9226);
const MIN_FONT_PX = 16;
const MOBILE_WIDTH = 390;
const MOBILE_HEIGHT = 844;

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const candidate of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try { return execFileSync("which", [candidate], { encoding: "utf8" }).trim(); } catch { /* next */ }
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

async function waitFor(client, expression, label) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (await evaluate(client, expression).catch(() => false)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function auditReadableText(client, label) {
  await sleep(100);
  const offenders = await evaluate(client, `(() => {
    const minimum = ${MIN_FONT_PX};
    const results = [];
    const controls = 'button,input,select,textarea,option';
    const skip = new Set(['SCRIPT','STYLE','SVG','PATH','DEFS','TEMPLATE']);
    const hasDirectText = (el) => [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    const visible = (el) => {
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && el.getClientRects().length > 0;
    };
    const describe = (el, size, pseudo = '') => ({
      tag: el.tagName.toLowerCase() + pseudo,
      className: typeof el.className === 'string' ? el.className.slice(0, 120) : '',
      size,
      text: (el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\\s+/g, ' ').slice(0, 100),
    });
    for (const el of document.body.querySelectorAll('*')) {
      if (skip.has(el.tagName) || !visible(el)) continue;
      if (el.matches(controls) || hasDirectText(el)) {
        const size = Number.parseFloat(getComputedStyle(el).fontSize || '0');
        if (Number.isFinite(size) && size > 0 && size < minimum - 0.01) results.push(describe(el, size));
      }
      for (const pseudo of ['::before', '::after']) {
        const style = getComputedStyle(el, pseudo);
        const content = style.content;
        if (!content || content === 'none' || content === 'normal' || content === '\"\"' || content === \"''\") continue;
        const size = Number.parseFloat(style.fontSize || '0');
        if (Number.isFinite(size) && size > 0 && size < minimum - 0.01) results.push(describe(el, size, pseudo));
      }
      if (results.length >= 30) break;
    }
    return results;
  })()`);
  if (offenders.length) throw new Error(`${label} contains visible text below ${MIN_FONT_PX}px: ${JSON.stringify(offenders)}`);
}

async function auditDocumentOverflow(client, label) {
  const dimensions = await evaluate(client, `(() => ({
    viewport: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }))()`);
  if (dimensions.documentWidth > dimensions.viewport + 1 || dimensions.bodyWidth > dimensions.viewport + 1) {
    throw new Error(`${label} overflows the mobile document: ${JSON.stringify(dimensions)}`);
  }
}

async function auditKeyboardFocus(client, label) {
  await evaluate(client, "document.activeElement?.blur(); true");
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  const focus = await evaluate(client, `(() => {
    const active = document.activeElement;
    if (!active || active === document.body || active === document.documentElement) return null;
    const style = getComputedStyle(active);
    return {
      tag: active.tagName.toLowerCase(),
      text: (active.textContent || active.getAttribute('aria-label') || active.getAttribute('placeholder') || '').trim().replace(/\\s+/g, ' ').slice(0, 100),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth || '0'),
      outlineOffset: Number.parseFloat(style.outlineOffset || '0'),
    };
  })()`);
  if (!focus) throw new Error(`${label} did not expose a keyboard-focusable control after Tab`);
  if (focus.outlineStyle === "none" || focus.outlineWidth < 1.5) {
    throw new Error(`${label} keyboard focus is not visibly outlined: ${JSON.stringify(focus)}`);
  }
}

async function auditReducedMotion(client, label) {
  await client.send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  const state = await evaluate(client, `(() => {
    const candidate = [...document.querySelectorAll('a,button,input,select,textarea,summary')]
      .find((node) => node.getClientRects().length > 0);
    if (!candidate) return null;
    const style = getComputedStyle(candidate);
    const durations = (value) => value.split(',').map((part) => {
      const text = part.trim();
      if (text.endsWith('ms')) return Number.parseFloat(text);
      if (text.endsWith('s')) return Number.parseFloat(text) * 1000;
      return Number.parseFloat(text) || 0;
    });
    return {
      media: matchMedia('(prefers-reduced-motion: reduce)').matches,
      transitionMs: Math.max(...durations(style.transitionDuration)),
      animationMs: Math.max(...durations(style.animationDuration)),
    };
  })()`);
  await client.send("Emulation.setEmulatedMedia", { media: "screen", features: [] });
  if (!state?.media) throw new Error(`${label} did not honor prefers-reduced-motion emulation`);
  if (state.transitionMs > 0.02 || state.animationMs > 0.02) {
    throw new Error(`${label} keeps visible motion under reduced-motion: ${JSON.stringify(state)}`);
  }
}

const checks = [
  { path: "/#dashboard", ready: "Boolean(document.querySelector('#content')) && !document.querySelector('.loading-state')" },
  { path: "/#analysis", ready: "Boolean(document.querySelector('.a2-shell'))" },
  { path: "/#generate", ready: "Boolean(document.querySelector('#content')) && !document.querySelector('.loading-state')" },
  { path: "/#games", ready: "Boolean(document.querySelector('#content')) && !document.querySelector('.loading-state')" },
  { path: "/#backtests", ready: "Boolean(document.querySelector('#content')) && !document.querySelector('.loading-state')" },
  { path: "/jobs", ready: "Boolean(document.querySelector('#job-form'))" },
  { path: "/strategies", ready: "Boolean(document.querySelector('#strategy-form'))" },
  { path: "/ai", ready: "Boolean(document.querySelector('#ai-form'))" },
  { path: "/lab", ready: "Boolean(document.querySelector('#lab-form'))" },
  { path: "/agenda", ready: "Boolean(document.querySelector('#agenda-grid'))" },
];

const chrome = findChrome();
const userDataDir = await mkdtemp(join(tmpdir(), "loto-lab-readability-"));
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

  for (const check of checks) {
    await navigate(client, check.path);
    await waitFor(client, check.ready, `${check.path} desktop readiness`);
    await auditReadableText(client, `${check.path} desktop`);
    await auditKeyboardFocus(client, `${check.path} desktop`);
  }

  await client.send("Emulation.setDeviceMetricsOverride", {
    width: MOBILE_WIDTH,
    height: MOBILE_HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });

  for (const check of checks) {
    await navigate(client, check.path);
    await waitFor(client, check.ready, `${check.path} mobile readiness`);
    await auditReadableText(client, `${check.path} mobile`);
    await auditDocumentOverflow(client, check.path);
    await auditKeyboardFocus(client, `${check.path} mobile`);
    await auditReducedMotion(client, check.path);
  }

  await client.send("Emulation.clearDeviceMetricsOverride");

  if (runtimeErrors.length) throw new Error(`Browser runtime exceptions: ${runtimeErrors.join(" | ")}`);
  if (serverErrors.length) throw new Error(`Browser API/server failures: ${serverErrors.join(" | ")}`);
  console.log(`Visual/a11y E2E passed: ${MIN_FONT_PX}px readability, keyboard focus, reduced motion and ${MOBILE_WIDTH}px no-overflow across all workspaces`);
} finally {
  client?.close();
  await stopBrowser(browser);
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 }).catch(() => {});
}
