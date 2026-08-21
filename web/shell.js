const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
  analysis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19V3"/><path d="M2 19h20"/></svg>',
  generate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"/><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"/></svg>',
  games: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a3 3 0 0 0 0 6v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a3 3 0 0 0 0-6V6Z"/><path d="M12 7v2M12 11v2M12 15v2"/></svg>',
  backtests: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>',
  lab: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 3h6"/><path d="M10 3v5l-5 9a2.5 2.5 0 0 0 2.2 4h9.6A2.5 2.5 0 0 0 19 17l-5-9V3"/><path d="M8 14h8"/></svg>',
  strategies: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6"/></svg>',
  jobs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h5M8 17h3"/></svg>',
  agenda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/><path d="M7 3v3M17 3v3"/></svg>',
  ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3a5 5 0 0 0-5 5c0 .7.1 1.3.4 1.9A4.5 4.5 0 0 0 9 18.6V21h6v-2.4a4.5 4.5 0 0 0 1.6-8.7A5 5 0 0 0 12 3Z"/><path d="M9 10h6M10 14h4"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
};

const ITEMS = [
  { key: "dashboard", label: "Dashboard", view: "dashboard" },
  { key: "analysis", label: "Análises", view: "analysis" },
  { key: "generate", label: "Gerar jogos", view: "generate" },
  { key: "games", label: "Meus jogos", view: "games" },
  { key: "backtests", label: "Backtests", view: "backtests", extra: true },
  { key: "lab", label: "Laboratório", href: "/lab", extra: true },
  { key: "strategies", label: "Estratégias", href: "/strategies", extra: true },
  { key: "jobs", label: "Execuções", href: "/jobs", extra: true },
  { key: "agenda", label: "Agenda", href: "/agenda", extra: true },
  { key: "ai", label: "IA", href: "/ai", extra: true },
];

const nav = document.querySelector("[data-shell-nav]");
const isMainApp = location.pathname === "/" || location.pathname === "/index.html";
const configuredActive = document.body.dataset.activeNav || "dashboard";
const mainViews = new Set(ITEMS.filter((item) => item.view).map((item) => item.view));
const lotteries = new Set(["mega-sena", "lotofacil", "dia-de-sorte"]);
const storedLottery = localStorage.getItem("loto-lab:lottery");
if (storedLottery && !lotteries.has(storedLottery)) localStorage.removeItem("loto-lab:lottery");

function requestedMainView() {
  return location.hash.replace("#", "");
}

function normalizeMainHash() {
  if (!isMainApp) return true;
  const requested = requestedMainView();
  if (requested && mainViews.has(requested)) return true;
  location.hash = "dashboard";
  return false;
}

function currentKey() {
  if (isMainApp) {
    const requested = requestedMainView();
    return mainViews.has(requested) ? requested : "dashboard";
  }
  return configuredActive;
}

function icon(key) {
  return `<span class="nav-icon" aria-hidden="true">${ICONS[key]}</span>`;
}

function hrefFor(item) {
  if (item.href) return item.href;
  return isMainApp ? `#${item.view}` : `/#${item.view}`;
}

function agendaBadge(item) {
  return item.key === "agenda"
    ? '<span class="agenda-nav-badge" data-agenda-nav-badge hidden></span>'
    : "";
}

function desktopItem(item) {
  const extraClass = item.extra ? " nav-desktop-extra" : "";
  if (isMainApp && item.view) {
    return `<button class="nav-item${extraClass}" data-view="${item.view}" data-nav-key="${item.key}" type="button" aria-label="${item.label}">${icon(item.key)}<span class="nav-label">${item.label}</span>${agendaBadge(item)}</button>`;
  }
  return `<a class="nav-link${extraClass}" data-nav-key="${item.key}" href="${hrefFor(item)}" aria-label="${item.label}">${icon(item.key)}<span class="nav-label">${item.label}</span>${agendaBadge(item)}</a>`;
}

function menuItem(item) {
  return `<a class="nav-more-link" data-nav-key="${item.key}" href="${hrefFor(item)}" aria-label="${item.label}">${icon(item.key)}<span class="nav-label">${item.label}</span>${agendaBadge(item)}</a>`;
}

function updateActive() {
  const active = currentKey();
  document.querySelectorAll("[data-nav-key]").forEach((item) => {
    const selected = item.dataset.navKey === active;
    item.classList.toggle("is-active", selected);
    if (selected) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  const more = document.querySelector("[data-nav-more]");
  more?.classList.toggle("is-active", ITEMS.some((item) => item.extra && item.key === active));
}

function closeMore(restoreFocus = false) {
  const button = document.querySelector("[data-nav-more]");
  const panel = document.querySelector("[data-nav-more-menu]");
  if (!button || !panel) return;
  const wasOpen = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", "false");
  panel.hidden = true;
  if (restoreFocus && wasOpen) button.focus();
}

normalizeMainHash();

if (nav) {
  const extras = ITEMS.filter((item) => item.extra);
  nav.innerHTML = `${ITEMS.map(desktopItem).join("")}
    <button class="nav-more" data-nav-more type="button" aria-label="Mais opções" aria-expanded="false" aria-controls="nav-more-panel">${icon("more")}<span class="nav-label">Mais</span></button>
    <div class="nav-more-menu" id="nav-more-panel" data-nav-more-menu hidden>${extras.map(menuItem).join("")}</div>`;

  const moreButton = nav.querySelector("[data-nav-more]");
  const morePanel = nav.querySelector("[data-nav-more-menu]");
  const mobileQuery = window.matchMedia("(max-width: 680px)");

  moreButton?.addEventListener("click", () => {
    const open = moreButton.getAttribute("aria-expanded") === "true";
    if (open) {
      closeMore();
      return;
    }
    moreButton.setAttribute("aria-expanded", "true");
    if (morePanel) morePanel.hidden = false;
  });
  morePanel?.addEventListener("click", () => closeMore());
  document.addEventListener("click", (event) => {
    if (!nav.contains(event.target)) closeMore();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMore(true);
  });
  mobileQuery.addEventListener("change", (event) => {
    if (!event.matches) closeMore();
  });
  window.addEventListener("hashchange", () => {
    if (!normalizeMainHash()) return;
    closeMore();
    updateActive();
  });
  updateActive();
}
