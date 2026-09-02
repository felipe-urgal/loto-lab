import { ApiError, api } from "../core/api.js";
import { escapeHtml } from "../shared/escaping.js";

type AgendaFilter = "all" | "unread";
type LotteryId = "mega-sena" | "lotofacil" | "dia-de-sorte";
type NotificationSeverity = "info" | "success" | "warning" | "error";

type AgendaItem = {
  lottery: LotteryId;
  currentContest: number;
  nextContest: number;
  nextDrawDate?: string;
  estimatedPrize?: number;
  accumulated: boolean;
  updatedAt: string;
};

type AgendaNotification = {
  id: number;
  severity: NotificationSeverity;
  title: string;
  body: string;
  actionHref?: string;
  readAt?: string;
  updatedAt: string;
};

type AgendaPayload = {
  agenda: AgendaItem[];
  notifications: AgendaNotification[];
  unreadCount: number;
};

const agendaGrid = document.querySelector<HTMLElement>("#agenda-grid");
const inbox = document.querySelector<HTMLElement>("#agenda-inbox");
const unreadCopy = document.querySelector<HTMLElement>("#agenda-unread-copy");
const badges = [...document.querySelectorAll<HTMLElement>("[data-agenda-nav-badge]")];
const agendaNavItems = [
  ...document.querySelectorAll<HTMLElement>('[data-nav-key="agenda"]'),
];
const refreshButton = document.querySelector<HTMLButtonElement>("#agenda-refresh");
const readAllButton = document.querySelector<HTMLButtonElement>("#agenda-read-all");
const filterButtons = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-agenda-filter]"),
];

const labels: Record<LotteryId, string> = {
  "mega-sena": "Mega-Sena",
  lotofacil: "Lotofácil",
  "dia-de-sorte": "Dia de Sorte",
};

let filter: AgendaFilter = "all";
let loadController: AbortController | undefined;
let loadToken = 0;

function formatMoney(value: unknown): string {
  if (value === undefined || value === null) return "Prêmio não informado";
  const number = Number(value);
  if (!Number.isFinite(number)) return "Prêmio não informado";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(number);
}

function formatDate(value: string | undefined): string {
  if (!value) return "Data a confirmar";
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "Data a confirmar";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

function formatDateTime(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function safeActionHref(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const url = new URL(value, location.origin);
    if (url.origin !== location.origin) return undefined;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return undefined;
  }
}

function renderAgenda(items: AgendaItem[]): void {
  if (!agendaGrid) return;
  if (!items.length) {
    agendaGrid.innerHTML =
      '<div class="panel agenda-empty">A agenda ainda não foi sincronizada. Use “Sincronizar agora” no Dashboard.</div>';
    return;
  }
  agendaGrid.innerHTML = items
    .map(
      (item) => `
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
  `,
    )
    .join("");
}

function renderNotifications(
  items: AgendaNotification[],
  unreadCount: number,
  requestFilter: AgendaFilter,
): void {
  if (!inbox || !unreadCopy) return;
  unreadCopy.textContent =
    unreadCount === 0
      ? "Nenhuma notificação não lida."
      : `${unreadCount} notificação(ões) não lida(s).`;

  for (const badge of badges) {
    badge.hidden = unreadCount === 0;
    badge.textContent = String(unreadCount > 99 ? "99+" : unreadCount);
  }
  const agendaLabel =
    unreadCount === 0
      ? "Agenda"
      : `Agenda, ${unreadCount} ${unreadCount === 1 ? "notificação não lida" : "notificações não lidas"}`;
  for (const navItem of agendaNavItems) navItem.setAttribute("aria-label", agendaLabel);

  if (!items.length) {
    inbox.innerHTML = `<div class="panel agenda-empty">${requestFilter === "unread" ? "Nenhuma notificação não lida." : "Nenhuma notificação registrada."}</div>`;
    return;
  }

  inbox.innerHTML = items
    .map((item) => {
      const actionHref = safeActionHref(item.actionHref);
      return `
    <article class="agenda-notification ${item.readAt ? "" : "is-unread"}" data-notification-id="${escapeHtml(item.id)}">
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
        ${item.readAt ? "" : `<button class="agenda-read" type="button" data-read-notification="${escapeHtml(item.id)}">Marcar como lida</button>`}
      </div>
    </article>`;
    })
    .join("");
}

function updateFilterState(): void {
  filterButtons.forEach((button) => {
    const selected = button.dataset.agendaFilter === filter;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return `HTTP ${error.status}`;
  return error instanceof Error ? error.message : "Erro desconhecido";
}

async function loadAgenda(): Promise<void> {
  const requestFilter = filter;
  const token = ++loadToken;
  loadController?.abort();
  const controller = new AbortController();
  loadController = controller;

  if (refreshButton) refreshButton.disabled = true;
  try {
    const payload = await api<AgendaPayload>(
      `/agenda${requestFilter === "unread" ? "?unread=true" : ""}`,
      { signal: controller.signal },
    );
    if (controller.signal.aborted || token !== loadToken) return;
    renderAgenda(payload?.agenda || []);
    renderNotifications(
      payload?.notifications || [],
      Number(payload?.unreadCount || 0),
      requestFilter,
    );
  } catch (error) {
    if (isAbortError(error) || token !== loadToken) return;
    if (agendaGrid) {
      agendaGrid.innerHTML =
        '<div class="panel agenda-empty">Não foi possível carregar a agenda.</div>';
    }
    if (inbox) {
      inbox.innerHTML = `<div class="panel agenda-empty">Falha ao carregar notificações: ${escapeHtml(errorMessage(error))}</div>`;
    }
  } finally {
    if (token === loadToken && refreshButton) refreshButton.disabled = false;
  }
}

async function markRead(id: number): Promise<void> {
  await api(`/notifications/${id}/read`, { method: "POST" });
  await loadAgenda();
}

async function markAllRead(): Promise<void> {
  if (readAllButton) readAllButton.disabled = true;
  try {
    await api("/notifications/read-all", { method: "POST" });
    await loadAgenda();
  } finally {
    if (readAllButton) readAllButton.disabled = false;
  }
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextFilter: AgendaFilter = button.dataset.agendaFilter === "unread" ? "unread" : "all";
    if (nextFilter === filter) return;
    filter = nextFilter;
    updateFilterState();
    void loadAgenda();
  });
});

inbox?.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const target = event.target.closest<HTMLButtonElement>("[data-read-notification]");
  if (!target) return;
  const id = Number(target.dataset.readNotification);
  if (!Number.isInteger(id) || id <= 0) return;
  target.disabled = true;
  markRead(id).catch(() => {
    if (target.isConnected) target.disabled = false;
  });
});

refreshButton?.addEventListener("click", () => {
  void loadAgenda();
});
readAllButton?.addEventListener("click", () => markAllRead().catch(() => undefined));

updateFilterState();
void loadAgenda();
