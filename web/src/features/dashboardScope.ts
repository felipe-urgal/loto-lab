import { api } from "../core/api.js";
import { currentMainView, onMainViewChanged, onViewRendered } from "../core/viewLifecycle.js";
import { escapeHtml } from "../shared/escaping.js";
import { formatDateTime } from "../shared/formatters.js";
import { toast } from "../shared/toast.js";
import {
  LOTTERIES,
  type ContestDto,
  type ContestsPayload,
  type FocusedDashboardData,
  type GameBatchesPayload,
  type LotteryCapabilitiesDto,
  type LotteryCatalogItemDto,
  type LotteryCatalogPayload,
  type LotteryId,
  type RealBetDto,
  type RealBetsPayload,
} from "./dashboardScope/types.js";

const LOTTERY_KEY = "loto-lab:lottery";
const root = document.querySelector<HTMLElement>("#content");
const select = document.querySelector<HTMLSelectElement>("#lottery-select");
const title = document.querySelector<HTMLElement>("#view-title");
const subtitle = document.querySelector<HTMLElement>("#view-subtitle");
const selectLabel = select?.closest(".select-control")?.querySelector<HTMLElement>("span") ?? null;
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh-view");

let applyToken = 0;
let scheduled = false;
let syncing = false;
let loadController: AbortController | null = null;

function validLottery(value: unknown): value is LotteryId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(LOTTERIES, value);
}

function savedLottery(): LotteryId {
  const value = localStorage.getItem(LOTTERY_KEY);
  return validLottery(value) ? value : "mega-sena";
}

function count(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatDate(value: unknown): string {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "—";
}

function numberLabel(value: unknown): string {
  return String(value).padStart(2, "0");
}

function nextContestNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric + 1 : null;
}

function resultMarkup(contest: ContestDto): string {
  if (Array.isArray(contest.numbers) && contest.numbers.length) {
    return `<div class="draw-numbers dashboard-result-numbers">${contest.numbers.map((value) => `<span class="ball">${numberLabel(value)}</span>`).join("")}</div>`;
  }
  return '<p class="dashboard-structured-result">Resultado disponível para esta modalidade.</p>';
}

function setHeader(lottery: LotteryId): void {
  if (title) title.textContent = "Painel";
  if (subtitle) subtitle.textContent = `Resultados, jogos e pendências de ${LOTTERIES[lottery]}.`;
}

function setRefreshControl(isDashboard: boolean): void {
  if (!refreshButton) return;
  let label = refreshButton.querySelector<HTMLElement>(".dashboard-refresh-label");
  if (isDashboard) {
    refreshButton.classList.add("dashboard-refresh");
    refreshButton.setAttribute("aria-label", "Atualizar dados");
    refreshButton.title = "Atualizar dados";
    if (!label) {
      label = document.createElement("span");
      label.className = "dashboard-refresh-label";
      refreshButton.append(label);
    }
    label.textContent = syncing ? "Atualizando..." : "Atualizar dados";
    return;
  }

  refreshButton.classList.remove("dashboard-refresh", "is-spinning");
  refreshButton.disabled = false;
  refreshButton.setAttribute("aria-label", "Atualizar tela");
  refreshButton.title = "Atualizar";
  label?.remove();
}

function syncLotteryControl(): void {
  if (!select) return;
  select.querySelector('option[value="all"]')?.remove();
  if (selectLabel) selectLabel.textContent = "Loteria";
  if (currentMainView() === "dashboard") select.value = savedLottery();
  setRefreshControl(currentMainView() === "dashboard");
}

function supports(
  catalog: Map<LotteryId, LotteryCatalogItemDto>,
  lottery: LotteryId,
  capability: keyof LotteryCapabilitiesDto,
): boolean {
  const value = catalog.get(lottery)?.capabilities?.[capability];
  return value !== false;
}

function hydrateLotteryOptions(payload: LotteryCatalogPayload, selected: LotteryId): void {
  if (!select) return;
  const items = (payload.items || []).filter(
    (item): item is LotteryCatalogItemDto & { id: LotteryId } =>
      item.enabled !== false && validLottery(item.id),
  );
  if (!items.length) return;

  select.innerHTML = items
    .map((item) => `<option value="${item.id}">${escapeHtml(item.name || LOTTERIES[item.id])}</option>`)
    .join("");
  select.value = items.some((item) => item.id === selected) ? selected : items[0].id;
}

function action(
  view: "analysis" | "generate",
  lottery: LotteryId,
  label: string,
  variant = "",
): string {
  return `<button class="button ${variant}" type="button" data-dashboard-open="${view}" data-dashboard-lottery="${lottery}">${escapeHtml(label)}</button>`;
}

function hero(
  lottery: LotteryId,
  contest: ContestDto | null,
  catalog: Map<LotteryId, LotteryCatalogItemDto>,
): string {
  const canGenerate = supports(catalog, lottery, "simulation");
  const canAnalyze = supports(catalog, lottery, "analysis");

  if (!contest) {
    return `<section class="dashboard-hero">
      <div class="dashboard-hero-copy">
        <span class="dashboard-eyebrow">${LOTTERIES[lottery]}</span>
        <h2>Sem resultado sincronizado</h2>
        <p>Atualize os dados para carregar o resultado mais recente desta modalidade.</p>
      </div>
      <div class="dashboard-hero-actions">
        ${canGenerate ? action("generate", lottery, "Gerar jogos", "primary") : ""}
        ${canAnalyze ? action("analysis", lottery, "Ver análises") : ""}
      </div>
    </section>`;
  }

  const next = nextContestNumber(contest.number);
  return `<section class="dashboard-hero">
    <div class="dashboard-hero-copy">
      <span class="dashboard-eyebrow">Último resultado · ${LOTTERIES[lottery]}</span>
      <div class="dashboard-result-title"><h2>Concurso #${contest.number ?? "—"}</h2><span>${formatDate(contest.date)}</span></div>
      ${resultMarkup(contest)}
      <p class="dashboard-next">Próximo concurso <strong>${next ? `#${next}` : "—"}</strong></p>
    </div>
    <div class="dashboard-hero-actions">
      ${canGenerate ? action("generate", lottery, "Gerar jogos", "primary") : ""}
      ${canAnalyze ? action("analysis", lottery, "Ver análises") : ""}
    </div>
  </section>`;
}

function summary(realBets: RealBetsPayload, batches: GameBatchesPayload): string {
  const saved = (batches.items || []).reduce((total, batch) => total + (batch.games?.length || 0), 0);
  const pending = count(realBets.summary?.pendingBets);
  const checked = count(realBets.summary?.checkedBets);

  return `<section class="dashboard-summary" aria-label="Resumo de jogos e conferência">
    <div><span>Jogos salvos</span><strong>${saved}</strong></div>
    <div><span>Pendentes</span><strong>${pending}</strong></div>
    <div><span>Conferidos</span><strong>${checked}</strong></div>
  </section>`;
}

function betStatus(bet: RealBetDto | undefined): { label: string; tone: string } {
  if (!bet) return { label: "Gerado", tone: "" };
  if (bet.status === "checked") return { label: "Conferido", tone: "is-success" };
  return { label: "Aguardando resultado", tone: "is-warning" };
}

function latestBetByBatch(realBets: RealBetsPayload): Map<number, RealBetDto> {
  const result = new Map<number, RealBetDto>();
  for (const bet of realBets.items || []) {
    const batchId = Number(bet.batchId);
    if (!Number.isFinite(batchId) || result.has(batchId)) continue;
    result.set(batchId, bet);
  }
  return result;
}

function savedGames(
  lottery: LotteryId,
  batches: GameBatchesPayload,
  realBets: RealBetsPayload,
  catalog: Map<LotteryId, LotteryCatalogItemDto>,
): string {
  const items = batches.items || [];
  const betByBatch = latestBetByBatch(realBets);
  const canCheck = supports(catalog, lottery, "checking");

  const rows = items.length
    ? items.slice(0, 5).map((batch) => {
      const batchId = Number(batch.id);
      const bet = betByBatch.get(batchId);
      const status = betStatus(bet);
      const canRefresh = canCheck && bet && bet.status !== "checked" && Number.isFinite(Number(bet.id));
      return `<div class="dashboard-game-row">
        <div class="dashboard-game-main">
          <strong>Lote #${escapeHtml(batch.id)}</strong>
          <span>${batch.games?.length || 0} jogo(s) · alvo ${batch.targetContestNumber ? `#${batch.targetContestNumber}` : "não definido"}</span>
        </div>
        <div class="dashboard-game-meta">
          <span class="dashboard-status ${status.tone}">${status.label}</span>
          <small>${formatDateTime(batch.createdAt)}</small>
          ${canRefresh ? `<button class="dashboard-inline-action" type="button" data-dashboard-check-bet="${bet.id}">Conferir agora</button>` : ""}
        </div>
      </div>`;
    }).join("")
    : '<div class="dashboard-empty"><strong>Nenhum jogo salvo</strong><span>Gere seus primeiros jogos para acompanhar tudo pelo Painel.</span></div>';

  return `<section class="dashboard-section">
    <div class="section-head dashboard-section-head">
      <div><h2>Seus jogos</h2><p>Jogos salvos e situação da conferência oficial.</p></div>
      ${supports(catalog, lottery, "simulation") ? action("generate", lottery, "Gerar novos") : ""}
    </div>
    <div class="dashboard-list">${rows}</div>
  </section>`;
}

function recentResults(contests: ContestsPayload): string {
  const items = contests.items || [];
  const rows = items.length
    ? items.slice(0, 5).map((contest) => `<div class="dashboard-result-row">
      <div><strong>Concurso #${contest.number ?? "—"}</strong><span>${formatDate(contest.date)}</span></div>
      ${resultMarkup(contest)}
    </div>`).join("")
    : '<div class="dashboard-empty"><strong>Sem resultados recentes</strong><span>Atualize os dados para carregar o histórico.</span></div>';

  return `<section class="dashboard-section">
    <div class="section-head dashboard-section-head"><div><h2>Resultados recentes</h2><p>Últimos concursos disponíveis na base.</p></div></div>
    <div class="dashboard-list">${rows}</div>
  </section>`;
}

function pendingSection(realBets: RealBetsPayload): string {
  const pending = (realBets.items || []).filter((bet) => bet.status !== "checked");
  if (!pending.length) {
    return `<section class="dashboard-section dashboard-pending">
      <div class="section-head dashboard-section-head"><div><h2>Pendências</h2><p>Nenhuma conferência pendente para esta modalidade.</p></div></div>
    </section>`;
  }

  return `<section class="dashboard-section dashboard-pending">
    <div class="section-head dashboard-section-head"><div><h2>Pendências</h2><p>${pending.length} aposta(s) aguardando resultado ou atualização.</p></div></div>
  </section>`;
}

function catalogMap(payload: LotteryCatalogPayload): Map<LotteryId, LotteryCatalogItemDto> {
  const result = new Map<LotteryId, LotteryCatalogItemDto>();
  for (const item of payload.items || []) {
    if (validLottery(item.id)) result.set(item.id, item);
  }
  return result;
}

async function safeApi<T>(path: string, fallback: T, signal: AbortSignal): Promise<T> {
  try {
    return (await api<T>(path, { signal })) ?? fallback;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    return fallback;
  }
}

async function loadFocusedData(lottery: LotteryId, signal: AbortSignal): Promise<FocusedDashboardData> {
  const [catalog, contests, realBets, batches] = await Promise.all([
    safeApi<LotteryCatalogPayload>("/lotteries", { items: [] }, signal),
    safeApi<ContestsPayload>(`/contests/${lottery}?limit=5`, { items: [] }, signal),
    safeApi<RealBetsPayload>(`/real-bets/${lottery}?limit=50`, { items: [], summary: {} }, signal),
    safeApi<GameBatchesPayload>(`/game-batches/${lottery}?limit=5`, { items: [] }, signal),
  ]);
  return { catalog, contests, realBets, batches };
}

function renderDashboard(lottery: LotteryId, data: FocusedDashboardData): void {
  if (!root) return;
  const catalog = catalogMap(data.catalog);
  const latest = data.contests.items?.[0] ?? null;

  root.innerHTML = `<div class="dashboard-shell">
    ${hero(lottery, latest, catalog)}
    ${summary(data.realBets, data.batches)}
    <div class="dashboard-columns">
      ${savedGames(lottery, data.batches, data.realBets, catalog)}
      ${recentResults(data.contests)}
    </div>
    ${pendingSection(data.realBets)}
  </div>`;
}

function cancelDashboardLoad(): void {
  applyToken += 1;
  loadController?.abort();
  loadController = null;
}

async function applyDashboard(): Promise<void> {
  if (!root || !select || currentMainView() !== "dashboard") return;

  loadController?.abort();
  const controller = new AbortController();
  loadController = controller;
  const token = ++applyToken;
  const lottery = validLottery(select.value) ? select.value : savedLottery();
  localStorage.setItem(LOTTERY_KEY, lottery);
  setHeader(lottery);

  try {
    const data = await loadFocusedData(lottery, controller.signal);
    if (
      controller.signal.aborted
      || token !== applyToken
      || currentMainView() !== "dashboard"
      || select.value !== lottery
    ) return;

    hydrateLotteryOptions(data.catalog, lottery);
    renderDashboard(lottery, data);
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) {
      root.innerHTML = '<div class="error-state"><strong>Não foi possível carregar o Painel</strong><p>Tente atualizar os dados ou carregar a tela novamente.</p></div>';
      toast("Não foi possível atualizar o Painel.", "error");
    }
  } finally {
    if (token === applyToken) loadController = null;
  }
}

function scheduleApply(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    void applyDashboard();
  });
}

async function syncDashboardData(): Promise<void> {
  if (!refreshButton || syncing || currentMainView() !== "dashboard") return;
  syncing = true;
  refreshButton.disabled = true;
  refreshButton.classList.add("is-spinning");
  setRefreshControl(true);

  try {
    await api("/operations/sync", { method: "POST" });
    window.dispatchEvent(new CustomEvent("loto-lab:data-synced"));
    toast("Dados atualizados.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível atualizar os dados.";
    toast(message, "error");
  } finally {
    syncing = false;
    refreshButton.disabled = false;
    refreshButton.classList.remove("is-spinning");
    setRefreshControl(currentMainView() === "dashboard");
  }
}

select?.addEventListener("change", () => {
  if (currentMainView() !== "dashboard" || !validLottery(select.value)) return;
  localStorage.setItem(LOTTERY_KEY, select.value);
  scheduleApply();
});

refreshButton?.addEventListener("click", (event) => {
  if (currentMainView() !== "dashboard") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void syncDashboardData();
}, { capture: true });

root?.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const checkButton = target?.closest<HTMLButtonElement>("[data-dashboard-check-bet]");
  if (checkButton) {
    const betId = Number(checkButton.dataset.dashboardCheckBet);
    if (!Number.isFinite(betId)) return;
    checkButton.disabled = true;
    checkButton.textContent = "Conferindo...";
    void api(`/real-bets/${betId}/check`, { method: "POST" })
      .then(() => {
        toast("Resultado atualizado.");
        scheduleApply();
      })
      .catch((error: unknown) => {
        checkButton.disabled = false;
        checkButton.textContent = "Conferir agora";
        toast(error instanceof Error ? error.message : "Não foi possível conferir a aposta.", "error");
      });
    return;
  }

  const button = target?.closest<HTMLElement>("[data-dashboard-open]");
  if (!button || !select) return;
  const lottery = button.dataset.dashboardLottery;
  const view = button.dataset.dashboardOpen;
  if (!validLottery(lottery) || (view !== "analysis" && view !== "generate")) return;

  localStorage.setItem(LOTTERY_KEY, lottery);
  select.value = lottery;
  window.location.hash = view;
});

onMainViewChanged((view) => {
  syncLotteryControl();
  if (view === "dashboard") scheduleApply();
  else cancelDashboardLoad();
});
window.addEventListener("loto-lab:data-synced", scheduleApply);
onViewRendered(({ view }) => {
  if (view === "dashboard") scheduleApply();
});

syncLotteryControl();
scheduleApply();
