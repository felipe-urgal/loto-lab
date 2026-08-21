const build = document.documentElement.dataset.build || "";
const loadedModules = new Set();
const loadedStyles = new Set();

function asset(name, extension) {
  const suffix = build ? `?v=${build}` : "";
  return `/assets/${name}.${extension}${suffix}`;
}

function loadStyle(name) {
  if (loadedStyles.has(name)) return;
  loadedStyles.add(name);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = asset(name, "css");
  link.dataset.featureStyle = name;
  document.head.append(link);
}

async function loadModule(name) {
  if (loadedModules.has(name)) return;
  loadedModules.add(name);
  try {
    await import(asset(name, "js"));
  } catch (error) {
    loadedModules.delete(name);
    console.error(`Failed to load feature module ${name}`, error);
  }
}

async function ensureViewFeatures() {
  const view = location.hash.replace("#", "") || "dashboard";
  if (view === "dashboard") {
    loadStyle("data-status");
    await loadModule("data-status");
    return;
  }

  loadStyle("refinements");
  await loadModule("refinements");

  if (view === "generate") {
    loadStyle("generation-diversity");
    await loadModule("generation-diversity");
  } else if (view === "games") {
    loadStyle("real-bets");
    loadStyle("my-games-management");
    await Promise.all([
      loadModule("real-bets"),
      loadModule("my-games-management"),
    ]);
  }
}

window.addEventListener("hashchange", () => { void ensureViewFeatures(); });
queueMicrotask(() => { void ensureViewFeatures(); });
