import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3099";
const debugPort = Number(process.env.E2E_READABILITY_CHROME_PORT || 9226);
const MIN_FONT_PX = 16;
const MIN_CONTROL_PX = 44;
const MAX_CLS = 0.25;
const MAX_DOM_READY_MS = 5000;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 390, height: 844 },
];

const CHECKS = [
  { path: "/#dashboard", ready: "Boolean(document.querySelector('.dashboard-shell'))" },
  { path: "/#analysis", ready: "Boolean(document.querySelector('.a2-shell'))" },
  { path: "/#generate", ready: "Boolean(document.querySelector('.g2-shell'))" },
];

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const candidate of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try {
      return execFileSync("which", [candidate], { encoding: "utf8" }).trim();
    } catch {
      // Try next executable.
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

  close() {
    this.socket.close();
  }
}

async function createPage() {
  const response = await fetch(
    `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent("about:blank")}`,
    { method: "PUT" },
  );
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
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Browser evaluation failed");
  }
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
    const controls = 'button,input,select,textarea,option,summary';
    const skip = new Set(['SCRIPT','STYLE','SVG','PATH','DEFS','TEMPLATE']);
    const hasDirectText = (el) => [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    const visible = (el) => {
      const style = getComputedStyle(el);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) !== 0
        && el.getClientRects().length > 0;
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
        if (!content || content === 'none' || content === 'normal' || content === '""' || content === "''") continue;
        const size = Number.parseFloat(style.fontSize || '0');
        if (Number.isFinite(size) && size > 0 && size < minimum - 0.01) results.push(describe(el, size, pseudo));
      }
      if (results.length >= 30) break;
    }
    return results;
  })()`);
  if (offenders.length) {
    throw new Error(`${label} contains visible text below ${MIN_FONT_PX}px: ${JSON.stringify(offenders)}`);
  }
}

async function auditDocumentOverflow(client, label) {
  const dimensions = await evaluate(client, `(() => ({
    viewport: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }))()`);
  if (dimensions.documentWidth > dimensions.viewport + 1 || dimensions.bodyWidth > dimensions.viewport + 1) {
    throw new Error(`${label} has structural horizontal overflow: ${JSON.stringify(dimensions)}`);
  }
}

async function auditControls(client, label) {
  const problems = await evaluate(client, `(() => {
    const minimum = ${MIN_CONTROL_PX};
    const visible = (el) => {
      const style = getComputedStyle(el);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) !== 0
        && el.getClientRects().length > 0;
    };
    const labelFor = (el) => {
      const aria = el.getAttribute('aria-label')?.trim();
      if (aria) return aria;
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const text = labelledBy.split(/\\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim();
        if (text) return text;
      }
      if (el.id) {
        const explicit = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (explicit?.textContent?.trim()) return explicit.textContent.trim();
      }
      const parent = el.closest('label');
      if (parent?.textContent?.trim()) return parent.textContent.trim();
      return (el.textContent || el.getAttribute('title') || el.getAttribute('placeholder') || '').trim();
    };
    const nodes = [...document.querySelectorAll(
      'button,input:not([type="hidden"]),select,textarea,summary,a.button,[data-nav-key]'
    )].filter(visible);
    const issues = [];
    for (const el of nodes) {
      const name = labelFor(el);
      if (!name) issues.push({ kind: 'accessible-name', tag: el.tagName, id: el.id, className: String(el.className).slice(0, 100) });

      const target = el.closest('label') || el;
      const rect = target.getBoundingClientRect();
      if (rect.height + 0.5 < minimum || rect.width + 0.5 < minimum) {
        issues.push({
          kind: 'target-size',
          tag: el.tagName,
          id: el.id,
          className: String(el.className).slice(0, 100),
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
          name: name.slice(0, 80),
        });
      }

      if (
        (el instanceof HTMLButtonElement || el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)
        && el.getAttribute('aria-disabled') === 'true'
        && !el.disabled
      ) {
        issues.push({ kind: 'aria-disabled-without-native-disabled', tag: el.tagName, id: el.id, name: name.slice(0, 80) });
      }
      if (issues.length >= 30) break;
    }
    return issues;
  })()`);
  if (problems.length) throw new Error(`${label} has inaccessible controls: ${JSON.stringify(problems)}`);
}

async function auditKeyboardFocus(client, label) {
  await evaluate(client, "document.activeElement?.blur(); true");
  const focusableCount = await evaluate(client, `(() => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    return [...document.querySelectorAll('a[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex]')]
      .filter((el) => visible(el) && !el.disabled && el.getAttribute('tabindex') !== '-1')
      .length;
  })()`);
  const traversalCount = Math.min(4, focusableCount);
  if (traversalCount < 2) {
    throw new Error(`${label} exposes fewer than two keyboard-focusable controls: ${focusableCount}`);
  }

  const focused = [];
  for (let index = 0; index < traversalCount; index += 1) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    const focus = await evaluate(client, `(() => {
      const active = document.activeElement;
      if (!active || active === document.body || active === document.documentElement) return null;
      const style = getComputedStyle(active);
      return {
        tag: active.tagName.toLowerCase(),
        name: (active.textContent || active.getAttribute('aria-label') || active.getAttribute('placeholder') || '').trim().replace(/\\s+/g, ' ').slice(0, 100),
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth || '0'),
      };
    })()`);
    if (!focus) {
      if (focused.length >= 2) break;
      throw new Error(`${label} lost keyboard focus before traversing two controls on Tab ${index + 1} of ${traversalCount}`);
    }
    if (focus.outlineStyle === "none" || focus.outlineWidth < 1.5) {
      throw new Error(`${label} keyboard focus is not visibly outlined: ${JSON.stringify(focus)}`);
    }
    focused.push(`${focus.tag}:${focus.name}`);
  }
  if (new Set(focused).size < 2) {
    throw new Error(`${label} keyboard traversal did not advance through controls: ${JSON.stringify(focused)}`);
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

async function auditLiveFeedback(client, label) {
  const state = await evaluate(client, `(() => ({
    contentLive: document.querySelector('#content')?.getAttribute('aria-live') || '',
    toastLive: document.querySelector('#toast-root')?.getAttribute('aria-live') || '',
    dataStatusLive: document.querySelector('#data-status-bar')?.getAttribute('aria-live') || '',
  }))()`);
  if (!state.contentLive || !state.toastLive || !state.dataStatusLive) {
    throw new Error(`${label} is missing asynchronous live-region feedback: ${JSON.stringify(state)}`);
  }
}

async function auditPerformance(client, label) {
  await sleep(150);
  const state = await evaluate(client, `(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      cls: Number(window.__lotoLabCls || 0),
      clsSupported: window.__lotoLabClsSupported !== false,
      domReadyMs: nav ? nav.domContentLoadedEventEnd : 0,
      loadMs: nav ? nav.loadEventEnd : 0,
    };
  })()`);
  if (state.clsSupported && state.cls > MAX_CLS) {
    throw new Error(`${label} exceeded CLS baseline ${MAX_CLS}: ${JSON.stringify(state)}`);
  }
  if (state.domReadyMs > MAX_DOM_READY_MS) {
    throw new Error(`${label} exceeded DOM-ready baseline ${MAX_DOM_READY_MS}ms: ${JSON.stringify(state)}`);
  }
  return state;
}

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
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__lotoLabCls = 0;
      window.__lotoLabClsSupported = true;
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) window.__lotoLabCls += entry.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
      } catch {
        window.__lotoLabClsSupported = false;
      }
    `,
  });

  const performanceResults = [];
  for (const viewport of VIEWPORTS) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    for (const check of CHECKS) {
      const label = `${check.path} ${viewport.name} ${viewport.width}x${viewport.height}`;
      await navigate(client, check.path);
      await waitFor(client, check.ready, `${label} readiness`);
      await auditReadableText(client, label);
      await auditDocumentOverflow(client, label);
      await auditControls(client, label);
      await auditKeyboardFocus(client, label);
      await auditReducedMotion(client, label);
      await auditLiveFeedback(client, label);
      performanceResults.push({ label, ...(await auditPerformance(client, label)) });
    }
  }

  await client.send("Emulation.clearDeviceMetricsOverride");

  if (runtimeErrors.length) throw new Error(`Browser runtime exceptions: ${runtimeErrors.join(" | ")}`);
  if (serverErrors.length) throw new Error(`Browser API/server failures: ${serverErrors.join(" | ")}`);

  console.log(
    `Redesign quality gate passed: ${VIEWPORTS.map((item) => `${item.name} ${item.width}x${item.height}`).join(", ")}; `
    + `${MIN_FONT_PX}px text; ${MIN_CONTROL_PX}px controls; keyboard focus; live feedback; reduced motion; no structural overflow.\n`
    + `Performance samples: ${JSON.stringify(performanceResults)}`,
  );
} finally {
  client?.close();
  await stopBrowser(browser);
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 }).catch(() => {});
}
