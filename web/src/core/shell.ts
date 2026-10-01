import {
  isLotteryId,
  isMainView,
  mainViewFromHash,
  requestedMainViewFromHash,
  type MainView,
} from "./mainContext.js";

interface NavigationItem {
  key: string;
  label: string;
  view: MainView;
}

const ICONS: Record<string, string> = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
  analysis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19V3"/><path d="M2 19h20"/></svg>',
  generate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"/><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"/></svg>',
};

const ITEMS: NavigationItem[] = [
  { key: "dashboard", label: "Painel", view: "dashboard" },
  { key: "analysis", label: "Análises", view: "analysis" },
  { key: "generate", label: "Gerar jogos", view: "generate" },
];

const LEGACY_PATH_REDIRECTS: Readonly<Record<string, MainView>> = {
  "/agenda": "dashboard",
  "/jobs": "dashboard",
  "/lab": "analysis",
  "/strategies": "analysis",
  "/ai": "analysis",
};

const nav = document.querySelector<HTMLElement>("[data-shell-nav]");
const isMainApp = location.pathname === "/" || location.pathname === "/index.html";
const storedLottery = localStorage.getItem("loto-lab:lottery");
if (storedLottery && !isLotteryId(storedLottery)) localStorage.removeItem("loto-lab:lottery");

function redirectLegacyPath(): boolean {
  if (isMainApp) return false;
  const target = LEGACY_PATH_REDIRECTS[location.pathname.replace(/\/$/, "")];
  if (!target) return false;
  location.replace(`/#${target}`);
  return true;
}

function normalizeMainHash(): boolean {
  if (!isMainApp) return true;
  const requested = requestedMainViewFromHash(location.hash);
  const normalized = mainViewFromHash(location.hash);
  if (requested && isMainView(requested)) return true;
  if (location.hash !== `#${normalized}`) {
    location.replace(`#${normalized}`);
    return false;
  }
  return true;
}

function currentKey(): string {
  return mainViewFromHash(location.hash);
}

function icon(key: string): string {
  return `<span class="nav-icon" aria-hidden="true">${ICONS[key] ?? ""}</span>`;
}

function hrefFor(item: NavigationItem): string {
  return isMainApp ? `#${item.view}` : `/#${item.view}`;
}

function navItem(item: NavigationItem): string {
  if (isMainApp) {
    return `<button class="nav-item" data-view="${item.view}" data-nav-key="${item.key}" type="button" aria-label="${item.label}">${icon(item.key)}<span class="nav-label">${item.label}</span></button>`;
  }
  return `<a class="nav-link" data-nav-key="${item.key}" href="${hrefFor(item)}" aria-label="${item.label}">${icon(item.key)}<span class="nav-label">${item.label}</span></a>`;
}

function updateActive(): void {
  const active = currentKey();
  document.querySelectorAll<HTMLElement>("[data-nav-key]").forEach((item) => {
    const selected = item.dataset.navKey === active;
    item.classList.toggle("is-active", selected);
    if (selected) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
}

if (!redirectLegacyPath()) {
  normalizeMainHash();

  if (nav) {
    nav.innerHTML = ITEMS.map(navItem).join("");
    window.addEventListener("hashchange", () => {
      if (!normalizeMainHash()) return;
      updateActive();
    });
    updateActive();
  }
}
