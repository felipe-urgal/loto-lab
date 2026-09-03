import { api } from "../core/api.js";
import { currentMainView, onMainViewChanged, onViewRendered } from "../core/viewLifecycle.js";
import { escapeHtml } from "../shared/escaping.js";
import { formatCurrency, formatDateTime, formatPercent } from "../shared/formatters.js";
import { toast } from "../shared/toast.js";
import { aggregateRealFinancial, knownNumber, toneFor } from "./dashboardScope/financial.js";
import {
  LOTTERIES,
  type AllDashboardData,
  type BacktestRunDto,
  type BacktestsPayload,
  type ContestDto,
  type DashboardEntry,
  type DashboardScope,
  type FocusedDashboardData,
  type GameBatchesPayload,
  type LotteryId,
  type RealBetsPayload,
} from "./dashboardScope/types.js";

const DASHBOARD_SCOPE_KEY = "loto-lab:dashboard-scope";
const LOTTERY_KEY = "loto-lab:lottery";
const LOTTERY_IDS = Object.keys(LOTTERIES) as LotteryId[];

const root = document.querySelector<HTMLElement>("#content");
const select = document.querySelector<HTMLSelectElement>("#lottery-select");
const title = document.querySelector<HTMLElement>("#view-title");
const subtitle = document.querySelector<HTMLElement>("#view-subtitle");
const selectLabel = select?.closest(".select-control")?.querySelector<HTMLElement>("span") ?? null;
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh-view");

let applyToken = 0;
let scheduled = false;
let navigatingFromDashboard = false;
let syncing = false;
let loadController: AbortController | null = null;

function validLottery(value: unknown): value is LotteryId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(LOTTERIES, value);
}

function normalizeScope(value: unknown): DashboardScope {
  return value === "all" || validLottery(value) ? value : "all";
}

function savedScope(): DashboardScope {
  return normalizeScope(localStorage.getItem(DASHBOARD_SCOPE_KEY));
}

function savedLottery(): LotteryId {
  const value = localStorage.getItem(LOTTERY_KEY);
  return validLottery(value) ? value : "mega-sena";
}

function ensureAllOption(): void {
  if (!select || select.querySelector('option[value="all"]')) return;
  const option = document.createElement("option");
  option.value = "all";
  option.textContent = "Todas as loterias";
  select.prepend(option);
}

function removeAllOption(): void {
  select?.querySelector('option[value="all"]')?.remove();
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

function syncScopeControl(): void {
  if (!select) return;
  const isDashboard = currentMainView() === "dashboard";
  setRefreshControl(isDashboard);

  if (isDashboard) {
    ensureAllOption();
    if (selectLabel) selectLabel.textContent = "Escopo";
    select.value = savedScope();
    return;
  }

  removeAllOption();
  if (selectLabel) selectLabel.textContent = "Loteria";
  select.value = savedLottery();
}

function setHeader(scope: DashboardScope): void {
  if (!title || !subtitle) return;
  if (scope === "all") {
    title.textContent = "Painel";
    subtitle.textContent = "Estado atual, desempenho e atividade das loterias.";
    return;
  }
  title.textContent = `Painel · ${LOTTERIES[scope]}`;
  subtitle.textContent = "Concurso atual, desempenho e atividade em um só lugar.";
}

function formatDate(value: unknown): string {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "—";
}

function number(value: unknown): string {
  return String(value).padStart(2, "0");
}

function count(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function nextContestNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric + 1 : null;
}

function balls(numbers: number[] | undefined): string {
  return (numbers || []).map((value) => `<span class="ball">${number(value)}</span>`).join("");
}

function dashboardAction(
  view: string,
  lottery: LotteryId,
  label: string,
  variant = "ghost",
): string {
  return `<button class="button compact ${variant}" type="button" data-dashboard-open="${view}" data-dashboard-lottery="${lottery}">${escapeHtml(label)}</button>`;
}

function metricCard(label: string, value: string, detail: string, tone = ""): string {
  return `<article class="panel dashboard-metric-card">
    <span class="dashboard-metric-label">${escapeHtml(label)}</span>
    <strong class="dashboard-metric-value ${tone}">${value}</strong>
    <span class="dashboard-metric-detail">${detail}</span>
  </article>`;
}

function performanceMetric(label: string, value: string, tone = ""): string {
  return `<span class="dashboard-performance-metric"><small>${escapeHtml(label)}</small><strong class="${tone}">${value}</strong></span>`;
}

function batchGameCount(batches: GameBatchesPayload): number {
  return (batches.items || []).reduce((total, batch) => total + (batch.games?.length || 0), 0);
}

function latestBacktest(backtests: BacktestsPayload): BacktestRunDto | undefined {
  return backtests.items?.[0];
}

function focusedMetrics(
  contest: ContestDto | null,
  backtests: BacktestsPayload,
  realBets: RealBetsPayload,
  batches: GameBatchesPayload,
): string {
  const backtest = latestBacktest(backtests);
  const historical = backtest?.summary || {};
  const real = realBets.summary || {};
  const net = knownNumber(real.netResult);
  const batchCount = batches.items?.length || 0;

  return `<section class="dashboard-metrics-grid" aria-label="Resumo do painel">
    ${metricCard("Último concurso", contest ? `#${contest.number}` : "—", contest ? formatDate(contest.date) : "Sem concurso sincronizado")}
    ${metricCard("Jogos recentes", String(batchGameCount(batches)), `${batchCount} lote(s) carregado(s)`)}
    ${metricCard("ROI histórico", formatPercent(historical.roi), backtest ? `Teste #${backtest.id}` : "Sem teste histórico", toneFor(historical.roi))}
    ${metricCard("Resultado real", formatCurrency(net), `${count(real.checkedBets)} conferida(s) · ${count(real.pendingBets)} pendente(s)`, toneFor(net))}
  </section>`;
}

function allMetrics(
  data: AllDashboardData,
  backtests: Map<LotteryId, BacktestsPayload>,
  realBets: Map<LotteryId, RealBetsPayload>,
): string {
  const updatedLotteries = data.contests.filter(([, contest]) => Boolean(contest)).length;
  const batches = data.batches.flatMap(([, value]) => value.items || []);
  const gameCount = batches.reduce((total, batch) => total + (batch.games?.length || 0), 0);
  const realSummaries = LOTTERY_IDS.map((lottery) => realBets.get(lottery)?.summary || {});
  const aggregate = aggregateRealFinancial(realSummaries);
  const historicalEntries = LOTTERY_IDS
    .map((lottery) => ({ lottery, run: latestBacktest(backtests.get(lottery) || { items: [] }) }))
    .filter((entry) => knownNumber(entry.run?.summary?.roi) !== undefined);
  historicalEntries.sort(
    (a, b) => (knownNumber(b.run?.summary?.roi) || 0) - (knownNumber(a.run?.summary?.roi) || 0),
  );
  const bestHistorical = historicalEntries[0];
  const aggregateDetail = aggregate.checkedCost === undefined
    ? "Custo conferido indisponível"
    : aggregate.checkedCost > 0
      ? `${formatCurrency(aggregate.checkedCost)} em custo conferido`
      : "Sem apostas conferidas";

  return `<section class="dashboard-metrics-grid" aria-label="Resumo do painel">
    ${metricCard("Cobertura atual", `${updatedLotteries}/${LOTTERY_IDS.length}`, "loterias com concurso sincronizado")}
    ${metricCard("Jogos recentes", String(gameCount), `${batches.length} lote(s) carregado(s)`)}
    ${metricCard("ROI real agregado", formatPercent(aggregate.roi), aggregateDetail, toneFor(aggregate.roi))}
    ${metricCard("Melhor ROI histórico", bestHistorical ? formatPercent(bestHistorical.run?.summary?.roi) : "—", bestHistorical ? `${LOTTERIES[bestHistorical.lottery]} · teste #${bestHistorical.run?.id}` : "Sem testes históricos", bestHistorical ? toneFor(bestHistorical.run?.summary?.roi) : "")}
  </section>`;
}

function focusedLatestCard(lottery: LotteryId, contest: ContestDto | null): string {
  if (!contest) {
    return `<article class="panel dashboard-latest-card dashboard-latest-empty">
      <div><h2>Último concurso</h2><p>${LOTTERIES[lottery]}</p></div>
      <div class="empty-state"><strong>Sem dados de concursos</strong><p>Atualize os dados para carregar o histórico desta loteria.</p></div>
    </article>`;
  }

  const nextContest = nextContestNumber(contest.number);
  return `<article class="panel dashboard-latest-card">
    <div class="dashboard-latest-main">
      <div class="dashboard-latest-head">
        <div><span class="dashboard-eyebrow">Concurso atual</span><h2>${LOTTERIES[lottery]}</h2><p>${formatDate(contest.date)}</p></div>
        <strong class="dashboard-contest-number">#${contest.number}</strong>
      </div>
      <div class="draw-numbers">${balls(contest.numbers)}</div>
      <span class="dashboard-target">Próximo alvo <strong>${nextContest ? `#${nextContest}` : "—"}</strong></span>
    </div>
    ${dashboardAction("generate", lottery, "Gerar jogos", "primary")}
  </article>`;
}

function realStatusCard(lottery: LotteryId, realBets: RealBetsPayload): string {
  const real = realBets.summary || {};
  const checked = count(real.checkedBets);
  const pending = count(real.pendingBets);
  const total = checked + pending;
  const checkedRatio = total > 0 ? checked / total : 0;
  const angle = Math.round(checkedRatio * 360);
  const net = knownNumber(real.netResult);

  return `<article class="panel dashboard-status-card">
    <div class="dashboard-status-head"><div><span class="dashboard-eyebrow">Apostas reais</span><h2>Conferência</h2></div>${dashboardAction("games", lottery, "Abrir jogos")}</div>
    <div class="dashboard-status-body">
      <div class="dashboard-donut" style="--dashboard-checked-angle:${angle}deg" aria-label="${checked} conferidas de ${total} apostas">
        <span><strong>${total ? Math.round(checkedRatio * 100) : 0}%</strong><small>conferidas</small></span>
      </div>
      <dl class="dashboard-status-list">
        <div><dt>Conferidas</dt><dd>${checked}</dd></div>
        <div><dt>Pendentes</dt><dd>${pending}</dd></div>
        <div><dt>Resultado</dt><dd class="${toneFor(net)}">${formatCurrency(net)}</dd></div>
      </dl>
    </div>
  </article>`;
}

function focusedPerformance(
  lottery: LotteryId,
  backtests: BacktestsPayload,
  realBets: RealBetsPayload,
): string {
  const backtest = latestBacktest(backtests);
  const summary = backtest?.summary || {};
  const real = realBets.summary || {};
  const net = knownNumber(real.netResult);

  return `<section class="dashboard-section">
    <div class="section-head dashboard-section-head">
      <div><h2>Desempenho</h2><p>Último teste histórico comparado ao resultado das apostas reais.</p></div>
      ${dashboardAction("backtests", lottery, "Ver testes históricos")}
    </div>
    <div class="panel dashboard-performance-panel">
      <div class="dashboard-performance-row">
        <div class="dashboard-performance-label"><strong>Histórico</strong><span>${backtest ? `Teste #${backtest.id}` : "Nenhum teste salvo"}</span></div>
        ${performanceMetric("ROI", formatPercent(summary.roi), toneFor(summary.roi))}
        ${performanceMetric("Cobertura", formatPercent(summary.financialCoverage))}
        ${performanceMetric("Melhor acerto", String(summary.bestHits ?? "—"))}
        ${performanceMetric("Prêmios", formatCurrency(summary.totalPrizeValue))}
      </div>
      <div class="dashboard-performance-row">
        <div class="dashboard-performance-label"><strong>Real</strong><span>${count(real.checkedBets)} conferida(s) · ${count(real.pendingBets)} pendente(s)</span></div>
        ${performanceMetric("ROI", formatPercent(real.roi), toneFor(real.roi))}
        ${performanceMetric("Gasto", formatCurrency(real.actualCost))}
        ${performanceMetric("Prêmios", formatCurrency(real.totalPrizeValue))}
        ${performanceMetric("Líquido", formatCurrency(net), toneFor(net))}
      </div>
    </div>
  </section>`;
}

function focusedRecentGames(lottery: LotteryId, batches: GameBatchesPayload): string {
  const items = batches.items || [];
  const markup = items.length
    ? items.slice(0, 4).map((batch) => `<div class="list-row">
      <div class="list-row-main"><strong>Lote #${batch.id}</strong><p>${batch.games?.length || 0} jogo(s) · alvo ${batch.targetContestNumber ? `#${batch.targetContestNumber}` : "não definido"}</p></div>
      <div class="list-row-value"><strong>${formatDateTime(batch.createdAt)}</strong></div>
    </div>`).join("")
    : `<div class="dashboard-inline-empty"><strong>Nenhum lote salvo</strong><span>Gere seus primeiros jogos para começar o histórico.</span></div>`;

  return `<section class="dashboard-section">
    <div class="section-head dashboard-section-head"><div><h2>Atividade recente</h2><p>Últimos lotes gerados para ${LOTTERIES[lottery]}.</p></div>${dashboardAction("games", lottery, "Ver meus jogos")}</div>
    <div class="panel list dashboard-recent-list">${markup}</div>
  </section>`;
}

function latestLotteryCard(lottery: LotteryId, contest: ContestDto | null): string {
  if (!contest) {
    return `<article class="panel dashboard-lottery-card"><div class="dashboard-lottery-head"><strong>${LOTTERIES[lottery]}</strong><span>Sem dados</span></div><div class="dashboard-inline-empty"><span>Atualize os dados para carregar esta loteria.</span></div></article>`;
  }

  const nextContest = nextContestNumber(contest.number);
  return `<article class="panel dashboard-lottery-card">
    <div class="dashboard-lottery-head"><strong>${LOTTERIES[lottery]}</strong><span>#${contest.number} · ${formatDate(contest.date)}</span></div>
    <div class="draw-numbers dashboard-lottery-numbers">${balls(contest.numbers)}</div>
    <div class="dashboard-lottery-footer"><span>Próximo <strong>${nextContest ? `#${nextContest}` : "—"}</strong></span>${dashboardAction("generate", lottery, "Gerar")}</div>
  </article>`;
}

function allPerformanceRow(
  lottery: LotteryId,
  backtests: BacktestsPayload,
  realBets: RealBetsPayload,
): string {
  const backtest = latestBacktest(backtests);
  const summary = backtest?.summary || {};
  const real = realBets.summary || {};
  const net = knownNumber(real.netResult);

  return `<div class="dashboard-performance-row dashboard-performance-row-all">
    <div class="dashboard-performance-label"><strong>${LOTTERIES[lottery]}</strong><span>${backtest ? `Teste #${backtest.id}` : "Sem teste histórico"}</span></div>
    ${performanceMetric("ROI histórico", formatPercent(summary.roi), toneFor(summary.roi))}
    ${performanceMetric("Cobertura", formatPercent(summary.financialCoverage))}
    ${performanceMetric("ROI real", formatPercent(real.roi), toneFor(real.roi))}
    ${performanceMetric("Líquido real", formatCurrency(net), toneFor(net))}
  </div>`;
}

function combinedBatchesMarkup(entries: DashboardEntry<GameBatchesPayload>[]): string {
  const batches = entries
    .flatMap(([lottery, data]) => (data.items || []).map((batch) => ({ ...batch, lottery: batch.lottery || lottery })))
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 6);

  if (!batches.length) {
    return `<div class="dashboard-inline-empty"><strong>Nenhum lote salvo</strong><span>Gere seus primeiros jogos para começar o histórico.</span></div>`;
  }

  return batches.map((batch) => `<div class="list-row">
    <div class="list-row-main"><strong>${validLottery(batch.lottery) ? LOTTERIES[batch.lottery] : escapeHtml(batch.lottery || "Loteria")} · Lote #${batch.id}</strong><p>${batch.games?.length || 0} jogo(s) · alvo ${batch.targetContestNumber ? `#${batch.targetContestNumber}` : "não definido"}</p></div>
    <div class="list-row-value"><strong>${formatDateTime(batch.createdAt)}</strong>${validLottery(batch.lottery) ? `<button class="dashboard-row-action" type="button" data-dashboard-open="games" data-dashboard-lottery="${batch.lottery}">Abrir jogos</button>` : ""}</div>
  </div>`).join("");
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
  const [contest, backtests, realBets, batches] = await Promise.all([
    safeApi<ContestDto | null>(`/contests/${lottery}/latest`, null, signal),
    safeApi<BacktestsPayload>(`/backtests/${lottery}?limit=1`, { items: [] }, signal),
    safeApi<RealBetsPayload>(`/real-bets/${lottery}?limit=50`, { items: [], summary: {} }, signal),
    safeApi<GameBatchesPayload>(`/game-batches/${lottery}?limit=4`, { items: [] }, signal),
  ]);
  return { contest, backtests, realBets, batches };
}

async function loadAllData(signal: AbortSignal): Promise<AllDashboardData> {
  const [contests, backtests, realBets, batches] = await Promise.all([
    Promise.all(LOTTERY_IDS.map(async (lottery): Promise<DashboardEntry<ContestDto | null>> => [
      lottery,
      await safeApi<ContestDto | null>(`/contests/${lottery}/latest`, null, signal),
    ] as const)),
    Promise.all(LOTTERY_IDS.map(async (lottery): Promise<DashboardEntry<BacktestsPayload>> => [
      lottery,
      await safeApi<BacktestsPayload>(`/backtests/${lottery}?limit=1`, { items: [] }, signal),
    ] as const)),
    Promise.all(LOTTERY_IDS.map(async (lottery): Promise<DashboardEntry<RealBetsPayload>> => [
      lottery,
      await safeApi<RealBetsPayload>(`/real-bets/${lottery}?limit=50`, { items: [], summary: {} }, signal),
    ] as const)),
    Promise.all(LOTTERY_IDS.map(async (lottery): Promise<DashboardEntry<GameBatchesPayload>> => [
      lottery,
      await safeApi<GameBatchesPayload>(`/game-batches/${lottery}?limit=3`, { items: [] }, signal),
    ] as const)),
  ]);
  return { contests, backtests, realBets, batches };
}

function renderFocusedDashboard(scope: LotteryId, data: FocusedDashboardData): void {
  if (!root) return;
  root.innerHTML = `<div class="dashboard-shell is-focused">
    ${focusedMetrics(data.contest, data.backtests, data.realBets, data.batches)}
    <section class="dashboard-overview-grid">
      ${focusedLatestCard(scope, data.contest)}
      ${realStatusCard(scope, data.realBets)}
    </section>
    ${focusedPerformance(scope, data.backtests, data.realBets)}
    ${focusedRecentGames(scope, data.batches)}
  </div>`;
}

function renderAllDashboard(data: AllDashboardData): void {
  if (!root) return;
  const backtests = new Map<LotteryId, BacktestsPayload>(data.backtests);
  const realBets = new Map<LotteryId, RealBetsPayload>(data.realBets);

  root.innerHTML = `<div class="dashboard-shell is-all">
    ${allMetrics(data, backtests, realBets)}
    <section class="dashboard-section">
      <div class="section-head dashboard-section-head"><div><h2>Concursos atuais</h2><p>Último resultado sincronizado e próximo alvo por loteria.</p></div></div>
      <div class="dashboard-lottery-grid">${data.contests.map(([lottery, contest]) => latestLotteryCard(lottery, contest)).join("")}</div>
    </section>
    <section class="dashboard-section">
      <div class="section-head dashboard-section-head"><div><h2>Desempenho por loteria</h2><p>Histórico e resultado real no mesmo quadro.</p></div></div>
      <div class="panel dashboard-performance-panel">${LOTTERY_IDS.map((lottery) => allPerformanceRow(lottery, backtests.get(lottery) || { items: [] }, realBets.get(lottery) || { items: [], summary: {} })).join("")}</div>
    </section>
    <section class="dashboard-section">
      <div class="section-head dashboard-section-head"><div><h2>Atividade recente</h2><p>Lotes mais recentes entre as três loterias.</p></div></div>
      <div class="panel list dashboard-recent-list">${combinedBatchesMarkup(data.batches)}</div>
    </section>
  </div>`;
}

function cancelDashboardLoad(): void {
  applyToken += 1;
  loadController?.abort();
  loadController = null;
}

async function applyDashboardScope(): Promise<void> {
  if (!root || !select || currentMainView() !== "dashboard") return;

  loadController?.abort();
  const controller = new AbortController();
  loadController = controller;
  const token = ++applyToken;
  const scope = normalizeScope(select.value || savedScope());
  localStorage.setItem(DASHBOARD_SCOPE_KEY, scope);
  setHeader(scope);

  try {
    const data = scope === "all"
      ? await loadAllData(controller.signal)
      : await loadFocusedData(scope, controller.signal);
    if (
      controller.signal.aborted
      || token !== applyToken
      || currentMainView() !== "dashboard"
      || normalizeScope(select.value) !== scope
    ) return;

    if (scope === "all") renderAllDashboard(data as AllDashboardData);
    else renderFocusedDashboard(scope, data as FocusedDashboardData);
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) {
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
    void applyDashboardScope();
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
  if (currentMainView() !== "dashboard" || navigatingFromDashboard) return;
  const scope = normalizeScope(select.value);
  localStorage.setItem(DASHBOARD_SCOPE_KEY, scope);
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
  const button = target?.closest<HTMLElement>("[data-dashboard-open]");
  if (!button) return;
  const lottery = button.dataset.dashboardLottery;
  const view = button.dataset.dashboardOpen;
  if (!validLottery(lottery) || !view || !select) return;

  const previousScope = savedScope();
  navigatingFromDashboard = true;
  select.value = lottery;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  navigatingFromDashboard = false;
  localStorage.setItem(DASHBOARD_SCOPE_KEY, previousScope);
  queueMicrotask(() => {
    window.location.hash = view;
  });
});

onMainViewChanged((view) => {
  syncScopeControl();
  if (view === "dashboard") scheduleApply();
  else cancelDashboardLoad();
});
window.addEventListener("loto-lab:data-synced", scheduleApply);
onViewRendered(({ view }) => {
  if (view === "dashboard") scheduleApply();
});

syncScopeControl();
scheduleApply();
