import { currentMainView, emitViewRendered } from "./viewLifecycle.js";

const build = document.documentElement.dataset.build || "";
const moduleLoads = new Map<string, Promise<boolean>>();
const styleLoads = new Map<string, Promise<boolean>>();
let lifecycleToken = 0;

type AssetExtension = "css" | "js";

function asset(name: string, extension: AssetExtension): string {
  const suffix = build ? `?v=${build}` : "";
  return `/assets/${name}.${extension}${suffix}`;
}

function loadStyle(name: string): Promise<boolean> {
  const existing = styleLoads.get(name);
  if (existing) return existing;

  const pending = new Promise<boolean>((resolve) => {
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

function loadModule(name: string): Promise<boolean> {
  const existing = moduleLoads.get(name);
  if (existing) return existing;

  const pending = import(asset(name, "js"))
    .then(() => true)
    .catch((error: unknown) => {
      moduleLoads.delete(name);
      console.error(`Failed to load feature module ${name}`, error);
      return false;
    });
  moduleLoads.set(name, pending);
  return pending;
}

async function loadStyledModule(name: string): Promise<boolean> {
  if (!await loadStyle(name)) return false;
  return loadModule(name);
}

async function ensureViewFeatures(): Promise<boolean> {
  const view = currentMainView();
  if (view === "dashboard") {
    if (!await loadStyledModule("dashboard-scope")) return false;
    return loadModule("data-status");
  }

  if (view === "analysis") {
    const stylesReady = await Promise.all([
      loadStyle("analysis-v2"),
      loadStyle("analysis-workspace"),
    ]);
    if (stylesReady.some((ready) => !ready)) return false;
    return loadModule("analysis-v2");
  }

  if (!await loadStyledModule("refinements")) return false;
  if (view === "generate") {
    if (!await loadStyledModule("generation-v2")) return false;
    return loadStyle("generation-workspace");
  }
  return true;
}

function isMainRenderPending(): boolean {
  const content = document.querySelector("#content");
  return Boolean(content?.querySelector(":scope > .loading-state:not([data-feature-owned])"));
}

function renderFeatureLoadError(view: string): void {
  const content = document.querySelector<HTMLElement>("#content");
  if (!content || currentMainView() !== view) return;
  content.innerHTML = '<div class="error-state"><span class="error-code">FEATURE_LOAD_ERROR</span><strong>Não foi possível carregar esta funcionalidade</strong><p>Os arquivos da funcionalidade não ficaram disponíveis. Tente carregar a tela novamente.</p><button class="button" type="button" data-feature-retry>Tentar novamente</button></div>';
  content.querySelector<HTMLButtonElement>("[data-feature-retry]")?.addEventListener("click", () => {
    document.querySelector<HTMLElement>("#refresh-view")?.click();
  });
}

async function emitWhenRendered(): Promise<void> {
  const token = ++lifecycleToken;
  const view = currentMainView();
  const lottery = document.querySelector<HTMLSelectElement>("#lottery-select")?.value || "mega-sena";
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
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  console.warn(`View lifecycle timed out for ${view}`);
}

window.addEventListener("hashchange", () => { void emitWhenRendered(); });
document.querySelector<HTMLSelectElement>("#lottery-select")?.addEventListener("change", () => { void emitWhenRendered(); });
document.querySelector<HTMLElement>("#refresh-view")?.addEventListener("click", () => { void emitWhenRendered(); });
queueMicrotask(() => { void emitWhenRendered(); });
