const agendaGrid = document.querySelector("#agenda-grid");
const inbox = document.querySelector("#agenda-inbox");
const unreadCopy = document.querySelector("#agenda-unread-copy");
const badges = [...document.querySelectorAll("[data-agenda-nav-badge]")];
const agendaNavItems = [...document.querySelectorAll('[data-nav-key="agenda"]')];
const refreshButton = document.querySelector("#agenda-refresh");
const readAllButton = document.querySelector("#agenda-read-all");
const filterButtons = [...document.querySelectorAll("[data-agenda-filter]")];

const labels = {
  "mega-sena": "Mega-Sena",
  lotofacil: "Lotofácil",
  "dia-de-sorte": "Dia de Sorte",
};

let filter = "all";
let loadController;
let loadToken = 0;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value) {
  if (value === undefined || value === null) return "Prêmio não informado";
  const number = Number(value);
  if (!Number.isFinite(number)) return "Prêmio não informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(number);
}

function formatDate(value) {
  if (!value) return "Data a confirmar";
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "Data a confirmar";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function safeActionHref(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : undefined;
}

function renderAgenda(items) {
  if (!agendaGrid) return;
  if (!items.length) {
    agendaGrid.innerHTML = '<div class="panel agenda-empty">A agenda ainda não foi sincronizada. Use “Sincronizar agora” no Dashboard.</div>';
    return;
  }
  agendaGrid.innerHTML = items.map((item) => `
    <article class="agenda-card">
      <div class="agenda-card-head">
        <h3>${escapeHtml(labels[item.lottery] || item.lottery)}</h3>
        <span class="agenda-status-pill">Oficial CAIXA</span>
      </div>
      <div class="next-contest">#${escapeHtml(item.nextContest)}</div>
      <p>${escapeHtml(formatDate(item.nextDrawDate))}</p>
      <div class="agenda-card-footer">
        <span class="agenda-prize">${escapeHtml(formatMoney(item.estimatedPrize))}</span>
        <span class="agenda-muted">Atualizado ${escapeHtml(formatDateTime(item.updatedAt))}</span>
      </div>
    </article>
  `).join("");
}

function renderNotifications(items, unreadCount, requestFilter) {
  if (!inbox || !unreadCopy) return;
  unreadCopy.textContent = unreadCount === 0
    ? "Nenhuma notificação não lida."
    : `${unreadCount} notificação(ões) não lida(s).`;

  for (const badge of badges) {
    badge.hidden = unreadCount === 0;
    badge.textContent = String(unreadCount > 99 ? "99+" : unreadCount);
  }
  const agendaLabel = unreadCount === 0
    ? "Agenda"
    : `Agenda, ${unreadCount} ${unreadCount === 1 ? "notificação não lida" : "notificações não lidas"}`;
  for (const navItem of agendaNavItems) navItem.setAttribute("aria-label", agendaLabel);

  if (!items.length) {
    inbox.innerHTML = `<div class="panel agenda-empty">${requestFilter === "unread" ? "Nenhuma notificação não lida." : "Nenhuma notificação registrada."}</div>`;
    return;
  }

  inbox.innerHTML = items.map((item) => {
    const actionHref = safeActionHref(item.actionHref);
    return `
    <article class="agenda-notification ${item.readAt ? "" : "is-unread"}" data-notification-id="${item.id}">
      <span class="agenda-severity ${escapeHtml(item.severity)}" aria-hidden="true"></span>
      <div>
        <div class="agenda-notification-main">
          <h3>${escapeHtml(item.title)}</h3>
          <span class="agenda-muted">${escapeHtml(formatDateTime(item.updatedAt))}</span>
        </div>
        <p>${escapeHtml(item.body)}</p>
      </div>
      <div class="agenda-notification-actions">
        ${actionHref ? `<a class="agenda-link" href="${escapeHtml(actionHref)}">Abrir</a>` : ""}
        ${item.readAt ? "" : `<button class="agenda-read" type="button" data-read-notification="${item.id}">Marcar como lida</button>`}
      </div>
    </article>`;
  }).join("");
}

function updateFilterState() {
  filterButtons.forEach((button) => {
    const selected = button.dataset.agendaFilter === filter;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

async function loadAgenda() {
  const requestFilter = filter;
  const token = ++loadToken;
  loadController?.abort();
  const controller = new AbortController();
  loadController = controller;

  if (refreshButton) refreshButton.disabled = true;
  try {
    const response = await fetch(`/api/v1/agenda${requestFilter === "unread" ? "?unread=true" : ""}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (controller.signal.aborted || token !== loadToken) return;
    renderAgenda(payload.agenda || []);
    renderNotifications(payload.notifications || [], Number(payload.unreadCount || 0), requestFilter);
  } catch (error) {
    if (error?.name === "AbortError" || token !== loadToken) return;
    if (agendaGrid) agendaGrid.innerHTML = '<div class="panel agenda-empty">Não foi possível carregar a agenda.</div>';
    if (inbox) inbox.innerHTML = `<div class="panel agenda-empty">Falha ao carregar notificações: ${escapeHtml(error.message)}</div>`;
  } finally {
    if (token === loadToken && refreshButton) refreshButton.disabled = false;
  }
}

async function markRead(id) {
  const response = await fetch(`/api/v1/notifications/${id}/read`, { method: "POST" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  await loadAgenda();
}

async function markAllRead() {
  if (readAllButton) readAllButton.disabled = true;
  try {
    const response = await fetch("/api/v1/notifications/read-all", { method: "POST" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await loadAgenda();
  } finally {
    if (readAllButton) readAllButton.disabled = false;
  }
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextFilter = button.dataset.agendaFilter || "all";
    if (nextFilter === filter) return;
    filter = nextFilter;
    updateFilterState();
    void loadAgenda();
  });
});

inbox?.addEventListener("click", (event) => {
  const target = event.target.closest("[data-read-notification]");
  if (!target) return;
  target.disabled = true;
  markRead(target.dataset.readNotification).catch(() => {
    if (target.isConnected) target.disabled = false;
  });
});

refreshButton?.addEventListener("click", () => { void loadAgenda(); });
readAllButton?.addEventListener("click", () => markAllRead().catch(() => undefined));

updateFilterState();
void loadAgenda();
