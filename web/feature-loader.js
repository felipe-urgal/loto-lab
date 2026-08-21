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
  const view = location.hash.replace("#", "") || "dashboard";
  if (view === "dashboard") {
    await loadStyledModule("data-status");
    return;
  }

  await loadStyledModule("refinements");

  if (view === "generate") {
    await loadStyledModule("generation-diversity");
  } else if (view === "games") {
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

function isMainRenderPending() {
  const content = document.querySelector("#content");
  return Boolean(content?.querySelector(":scope > .loading-state"));
}

async function emitWhenRendered() {
  const token = ++lifecycleToken;
  const view = location.hash.replace("#", "") || "dashboard";
  const lottery = document.querySelector("#lottery-select")?.value || "mega-sena";
  await ensureViewFeatures();

  for (let frame = 0; frame < 120; frame += 1) {
    if (token !== lifecycleToken) return;
    if (!isMainRenderPending()) {
      window.dispatchEvent(new CustomEvent("loto-lab:view-rendered", {
        detail: { view, lottery, token },
      }));
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
