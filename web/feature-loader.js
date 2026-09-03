import { currentMainView, emitViewRendered } from "./runtime.js";

const build = document.documentElement.dataset.build || "";
const moduleLoads = new Map();
const styleLoads = new Map();
let lifecycleToken = 0;

function asset(name, extension) {
  const suffix = build ? `?v=${build}` : "";
  return `/assets/${name}.${extension}${suffix}`;
}

function loadStyle(name) {
  const existing = styleLoads.get(name);
  if (existing) return existing;

  const pending = new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = asset(name, "css");
    link.dataset.featureStyle = name;
    link.addEventListener("load", () => resolve(true), { once: true });
    link.addEventListener("error", () => {
      styleLoads.delete(name);
      link.remove();
      console.error(`Failed to load feature stylesheet ${name}`);
      resolve(false);
    }, { once: true });
    document.head.append(link);
  });

  styleLoads.set(name, pending);
  return pending;
}

function loadModule(name) {
  const existing = moduleLoads.get(name);
  if (existing) return existing;

  const pending = import(asset(name, "js"))
    .then(() => true)
    .catch((error) => {
      moduleLoads.delete(name);
      console.error(`Failed to load feature module ${name}`, error);
      return false;
    });
  moduleLoads.set(name, pending);
  return pending;
}

async function loadStyledModule(name) {
  await loadStyle(name);
  return loadModule(name);
}

async function ensureViewFeatures() {
  const view = currentMainView();
  if (view === "dashboard") {
    // Dashboard scope owns the final presentation, including operational status.
    // Load the scope first so the status module mounts against its canonical CSS.
    await loadStyledModule("dashboard-scope");
    await loadModule("data-status");
    return;
  }

  if (view === "analysis") {
    await loadStyle("analysis-v2");
    // Prototype 1 owns the final analysis presentation and its structural
    // hardening without changing any statistical or interaction contract.
    await loadStyle("analysis-workspace");
    await loadModule("analysis-v2");
    return;
  }

  if (view === "backtests") {
    // Backtests is now typed-only functional ownership. app.js provides only a
    // shell handoff marker; failure to load the canonical assets is surfaced
    // explicitly instead of reviving duplicated legacy behavior.
    const styleReady = await loadStyle("backtests-workspace");
    return styleReady ? loadModule("backtests") : false;
  }

  await loadStyledModule("refinements");

  if (view === "generate") {
    // Generator 2.0 owns the advanced workspace. The basic generator rendered
    // by app.js remains the fallback when this optional module cannot mount.
    await loadStyledModule("generation-v2");
    // Readiness keeps derived local defaults aligned with the latest conditioned plan.
    await loadModule("generation-readiness");
    // Explainability remains additive JS; its presentation is owned by the final workspace.
    await loadModule("generation-explainability");
    // Prototype 1 owns the final presentation after both functional layers exist.
    await loadStyle("generation-workspace");
  } else if (view === "games") {
    // My Games 2.0 owns the clean management surface. If it cannot load, keep
    // the previous refinements as a functional fallback instead of breaking the view.
    const styleReady = await loadStyle("my-games-v2");
    const moduleReady = styleReady ? await loadModule("my-games-v2") : false;
    if (moduleReady) {
      await loadModule("real-bet-auditability");
      // Prototype 1 owns final presentation only after the functional and
      // auditability layers are mounted.
      await loadStyle("my-games-workspace");
    } else {
      await Promise.all([
        loadStyle("real-bets"),
        loadStyle("my-games-management"),
      ]);
      await Promise.all([
        loadModule("real-bets"),
        loadModule("my-games-management"),
      ]);
    }
  }
}

function isMainRenderPending() {
  const content = document.querySelector("#content");
  return Boolean(content?.querySelector(":scope > .loading-state:not([data-feature-owned])"));
}

function renderFeatureLoadError(view) {
  const content = document.querySelector("#content");
  if (!content || currentMainView() !== view) return;
  content.innerHTML = '<div class="error-state"><span class="error-code">FEATURE_LOAD_ERROR</span><strong>Não foi possível carregar Testes históricos</strong><p>Os arquivos da funcionalidade não ficaram disponíveis. Tente carregar a tela novamente.</p><button class="button" type="button" data-feature-retry>Tentar novamente</button></div>';
  content.querySelector("[data-feature-retry]")?.addEventListener("click", () => {
    document.querySelector("#refresh-view")?.click();
  });
}

async function emitWhenRendered() {
  const token = ++lifecycleToken;
  const view = currentMainView();
  const lottery = document.querySelector("#lottery-select")?.value || "mega-sena";
  const featuresReady = await ensureViewFeatures();

  for (let frame = 0; frame < 120; frame += 1) {
    if (token !== lifecycleToken) return;
    if (!isMainRenderPending()) {
      if (featuresReady === false) {
        renderFeatureLoadError(view);
        return;
      }
      emitViewRendered({ view, lottery, token });
      return;
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  console.warn(`View lifecycle timed out for ${view}`);
}

window.addEventListener("hashchange", () => { void emitWhenRendered(); });
document.querySelector("#lottery-select")?.addEventListener("change", () => { void emitWhenRendered(); });
document.querySelector("#refresh-view")?.addEventListener("click", () => { void emitWhenRendered(); });
queueMicrotask(() => { void emitWhenRendered(); });
