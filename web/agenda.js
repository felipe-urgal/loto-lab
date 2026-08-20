const agendaGrid = document.querySelector("#agenda-grid");
const inbox = document.querySelector("#agenda-inbox");
const unreadCopy = document.querySelector("#agenda-unread-copy");
const badge = document.querySelector("#agenda-nav-badge");
const refreshButton = document.querySelector("#agenda-refresh");
const readAllButton = document.querySelector("#agenda-read-all");
const filterButtons = [...document.querySelectorAll("[data-agenda-filter]")];

const labels = {
  "mega-sena": "Mega-Sena",
  lotofacil: "Lotofácil",
  "dia-de-sorte": "Dia de Sorte",
};

let filter = "all";

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
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(value));
}

function formatDate(value) {
  if (!value) return "Data a confirmar";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
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

function renderNotifications(items, unreadCount) {
  if (!inbox || !unreadCopy) return;
  unreadCopy.textContent = unreadCount === 0
    ? "Nenhuma notificação não lida."
    : `${unreadCount} notificação(ões) não lida(s).`;
  if (badge) {
    badge.hidden = unreadCount === 0;
    badge.textContent = String(unreadCount > 99 ? "99+" : unreadCount);
  }

  if (!items.length) {
    inbox.innerHTML = `<div class="panel agenda-empty">${filter === "unread" ? "Nenhuma notificação não lida." : "Nenhuma notificação registrada."}</div>`;
    return;
  }

  inbox.innerHTML = items.map((item) => `
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
        ${item.actionHref ? `<a class="agenda-link" href="${escapeHtml(item.actionHref)}">Abrir</a>` : ""}
        ${item.readAt ? "" : `<button class="agenda-read" type="button" data-read-notification="${item.id}">Marcar como lida</button>`}
      </div>
    </article>
  `).join("");
}

async function loadAgenda() {
  if (refreshButton) refreshButton.disabled = true;
  try {
    const response = await fetch(`/api/v1/agenda${filter === "unread" ? "?unread=true" : ""}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    renderAgenda(payload.agenda || []);
    renderNotifications(payload.notifications || [], Number(payload.unreadCount || 0));
  } catch (error) {
    if (agendaGrid) agendaGrid.innerHTML = '<div class="panel agenda-empty">Não foi possível carregar a agenda.</div>';
    if (inbox) inbox.innerHTML = `<div class="panel agenda-empty">Falha ao carregar notificações: ${escapeHtml(error.message)}</div>`;
  } finally {
    if (refreshButton) refreshButton.disabled = false;
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
    filter = button.dataset.agendaFilter || "all";
    filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    loadAgenda();
  });
});

inbox?.addEventListener("click", (event) => {
  const target = event.target.closest("[data-read-notification]");
  if (!target) return;
  markRead(target.dataset.readNotification).catch(() => undefined);
});

refreshButton?.addEventListener("click", loadAgenda);
readAllButton?.addEventListener("click", () => markAllRead().catch(() => undefined));

loadAgenda();
