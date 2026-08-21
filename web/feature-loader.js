const build = document.documentElement.dataset.build || "";
const moduleLoads = new Map();
const styleLoads = new Map();

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
  if (!await loadStyle(name)) return false;
  return loadModule(name);
}

async function ensureViewFeatures() {
  const view = location.hash.replace("#", "") || "dashboard";
  if (view === "dashboard") {
    await loadStyledModule("data-status");
    return;
  }

  if (!await loadStyledModule("refinements")) return;

  if (view === "generate") {
    await loadStyledModule("generation-diversity");
  } else if (view === "games") {
    const stylesReady = await Promise.all([
      loadStyle("real-bets"),
      loadStyle("my-games-management"),
    ]);
    if (stylesReady.every(Boolean)) {
      await Promise.all([
        loadModule("real-bets"),
        loadModule("my-games-management"),
      ]);
    }
  }
}

window.addEventListener("hashchange", () => { void ensureViewFeatures(); });
queueMicrotask(() => { void ensureViewFeatures(); });
