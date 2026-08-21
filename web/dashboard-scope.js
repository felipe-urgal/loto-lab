import {
  api,
  escapeHtml,
  formatCurrency,
  formatDateTime,
  formatPercent,
  onViewRendered,
  toast,
} from "./runtime.js";

const DASHBOARD_SCOPE_KEY = "loto-lab:dashboard-scope";
const LOTTERY_KEY = "loto-lab:lottery";
const LOTTERIES = {
  "mega-sena": "Mega-Sena",
  lotofacil: "Lotofácil",
  "dia-de-sorte": "Dia de Sorte",
};
const LOTTERY_IDS = Object.keys(LOTTERIES);

const root = document.querySelector("#content");
const select = document.querySelector("#lottery-select");
const title = document.querySelector("#view-title");
const subtitle = document.querySelector("#view-subtitle");
const selectLabel = select?.closest(".select-control")?.querySelector("span");
const refreshButton = document.querySelector("#refresh-view");
let applyToken = 0;
let scheduled = false;
let navigatingFromDashboard = false;
let syncing = false;

function currentView() {
  return location.hash.replace("#", "") || "dashboard";
}

function validLottery(value) {
  return Boolean(LOTTERIES[value]);
}

function normalizeScope(value) {
  return value === "all" || validLottery(value) ? value : "all";
}

function savedScope() {
  return normalizeScope(localStorage.getItem(DASHBOARD_SCOPE_KEY));
}

function savedLottery() {
  const value = localStorage.getItem(LOTTERY_KEY);
  return validLottery(value) ? value : "mega-sena";
}

function ensureAllOption() {
  if (!select || select.querySelector('option[value="all"]')) return;
  const option = document.createElement("option");
  option.value = "all";
  option.textContent = "Todas as loterias";
  select.prepend(option);
}

function removeAllOption() {
  select?.querySelector('option[value="all"]')?.remove();
}

function setRefreshControl(isDashboard) {
  if (!refreshButton) return;
  let label = refreshButton.querySelector(".dashboard-refresh-label");
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

function syncScopeControl() {
  if (!select) return;
  const isDashboard = currentView() === "dashboard";
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

function setHeader(scope) {
  if (!title || !subtitle) return;
  if (scope === "all") {
    title.textContent = "Painel";
    subtitle.textContent = "Concursos, desempenho e atividade das loterias.";
    return;
  }
  title.textContent = `Painel · ${LOTTERIES[scope]}`;
  subtitle.textContent = "Último concurso, desempenho e atividade em um só lugar.";
}

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "—";
}

function number(value) {
  return String(value).padStart(2, "0");
}

function nextContestNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric + 1 : null;
}

function balls(numbers) {
  return (numbers || []).map((value) => `<span class="ball">${number(value)}</span>`).join("");
}

function toneFor(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? (numeric >= 0 ? "positive" : "negative") : "";
}

function netTone(value) {
  const numeric = Number(value || 0);
  return numeric >= 0 ? "positive" : "negative";
}

function dashboardAction(view, lottery, label, variant = "ghost") {
  return `<button class="button compact ${variant}" type="button" data-dashboard-open="${view}" data-dashboard-lottery="${lottery}">${escapeHtml(label)}</button>`;
}

function performanceMetric(label, value, tone = "") {
  return `<span class="dashboard-performance-metric"><small>${escapeHtml(label)}</small><strong class="${tone}">${value}</strong></span>`;
}

function focusedLatestCard(lottery, contest) {
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
        <div><h2>Último concurso</h2><p>${LOTTERIES[lottery]} · ${formatDate(contest.date)}</p></div>
        <strong class="dashboard-contest-number">Concurso ${contest.number}</strong>
      </div>
      <div class="draw-numbers">${balls(contest.numbers)}</div>
      <span class="dashboard-target">Próximo alvo <strong>${nextContest ? `#${nextContest}` : "—"}</strong></span>
    </div>
    ${dashboardAction("generate", lottery, "Gerar jogos", "primary")}
  </article>`;
}

function focusedPerformance(lottery, backtests, realBets) {
  const backtest = backtests?.items?.[0];
  const summary = backtest?.summary || {};
  const real = realBets?.summary || {};
  const net = Number(real.netResult || 0);

  return `<section class="dashboard-section">
    <div class="section-head dashboard-section-head">
      <div><h2>Desempenho</h2><p>Último teste histórico comparado ao resultado das apostas reais.</p></div>
      ${dashboardAction("backtests", lottery, "Ver testes históricos")}
    </div>
    <div class="panel dashboard-performance-panel">
      <div class="dashboard-performance-row">
        <div class="dashboard-performance-label"><strong>Estratégia</strong><span>${backtest ? `Teste histórico #${backtest.id}` : "Nenhum teste histórico salvo"}</span></div>
        ${performanceMetric("ROI", formatPercent(summary.roi), toneFor(summary.roi))}
        ${performanceMetric("Cobertura", formatPercent(summary.financialCoverage))}
        ${performanceMetric("Melhor acerto", summary.bestHits ?? "—")}
        ${performanceMetric("Prêmios", formatCurrency(summary.totalPrizeValue))}
      </div>
      <div class="dashboard-performance-row">
        <div class="dashboard-performance-label"><strong>Resultado real</strong><span>${real.checkedBets || 0} conferida(s) · ${real.pendingBets || 0} pendente(s)</span></div>
        ${performanceMetric("ROI", formatPercent(real.roi), toneFor(real.roi))}
        ${performanceMetric("Gasto", formatCurrency(real.actualCost || 0))}
        ${performanceMetric("Prêmios", formatCurrency(real.totalPrizeValue || 0))}
        ${performanceMetric("Líquido", formatCurrency(net), netTone(net))}
      </div>
    </div>
  </section>`;
}

function focusedRecentGames(lottery, batches) {
  const items = batches?.items || [];
  const markup = items.length
    ? items.slice(0, 4).map((batch) => `<div class="list-row">
      <div class="list-row-main"><strong>Lote #${batch.id}</strong><p>${batch.games?.length || 0} jogo(s) · alvo ${batch.targetContestNumber ? `#${batch.targetContestNumber}` : "não definido"}</p></div>
      <div class="list-row-value"><strong>${formatDateTime(batch.createdAt)}</strong></div>
    </div>`).join("")
    : `<div class="dashboard-inline-empty"><strong>Nenhum lote salvo</strong><span>Gere seus primeiros jogos para começar o histórico.</span></div>`;

  return `<section class="dashboard-section">
    <div class="section-head dashboard-section-head"><div><h2>Jogos recentes</h2><p>Últimos lotes gerados para ${LOTTERIES[lottery]}.</p></div>${dashboardAction("games", lottery, "Ver meus jogos")}</div>
    <div class="panel list dashboard-recent-list">${markup}</div>
  </section>`;
}

function latestLotteryCard(lottery, contest) {
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

function allPerformanceRow(lottery, backtests, realBets) {
  const backtest = backtests?.items?.[0];
  const summary = backtest?.summary || {};
  const real = realBets?.summary || {};
  const net = Number(real.netResult || 0);

  return `<div class="dashboard-performance-row dashboard-performance-row-all">
    <div class="dashboard-performance-label"><strong>${LOTTERIES[lottery]}</strong><span>${backtest ? `Teste #${backtest.id}` : "Sem teste histórico"}</span></div>
    ${performanceMetric("ROI histórico", formatPercent(summary.roi), toneFor(summary.roi))}
    ${performanceMetric("Cobertura", formatPercent(summary.financialCoverage))}
    ${performanceMetric("ROI real", formatPercent(real.roi), toneFor(real.roi))}
    ${performanceMetric("Líquido real", formatCurrency(net), netTone(net))}
  </div>`;
}

function combinedBatchesMarkup(entries) {
  const batches = entries
    .flatMap(([lottery, data]) => (data?.items || []).map((batch) => ({ ...batch, lottery: batch.lottery || lottery })))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  if (!batches.length) {
    return `<div class="dashboard-inline-empty"><strong>Nenhum lote salvo</strong><span>Gere seus primeiros jogos para começar o histórico.</span></div>`;
  }

  return batches.map((batch) => `<div class="list-row">
    <div class="list-row-main"><strong>${LOTTERIES[batch.lottery] || batch.lottery} · Lote #${batch.id}</strong><p>${batch.games?.length || 0} jogo(s) · alvo ${batch.targetContestNumber ? `#${batch.targetContestNumber}` : "não definido"}</p></div>
    <div class="list-row-value"><strong>${formatDateTime(batch.createdAt)}</strong><button class="dashboard-row-action" type="button" data-dashboard-open="games" data-dashboard-lottery="${batch.lottery}">Abrir jogos</button></div>
  </div>`).join("");
}

async function loadFocusedData(lottery) {
  const [contest, backtests, realBets, batches] = await Promise.all([
    api(`/contests/${lottery}/latest`).catch(() => null),
    api(`/backtests/${lottery}?limit=1`).catch(() => ({ items: [] })),
    api(`/real-bets/${lottery}?limit=50`).catch(() => ({ items: [], summary: {} })),
    api(`/game-batches/${lottery}?limit=4`).catch(() => ({ items: [] })),
  ]);
  return { contest, backtests, realBets, batches };
}

async function loadAllData() {
  const [contests, backtests, realBets, batches] = await Promise.all([
    Promise.all(LOTTERY_IDS.map(async (lottery) => [lottery, await api(`/contests/${lottery}/latest`).catch(() => null)])),
    Promise.all(LOTTERY_IDS.map(async (lottery) => [lottery, await api(`/backtests/${lottery}?limit=1`).catch(() => ({ items: [] }))])),
    Promise.all(LOTTERY_IDS.map(async (lottery) => [lottery, await api(`/real-bets/${lottery}?limit=50`).catch(() => ({ items: [], summary: {} }))])),
    Promise.all(LOTTERY_IDS.map(async (lottery) => [lottery, await api(`/game-batches/${lottery}?limit=3`).catch(() => ({ items: [] }))])),
  ]);
  return { contests, backtests, realBets, batches };
}

function renderFocusedDashboard(scope, data) {
  root.innerHTML = `<div class="dashboard-shell is-focused">
    ${focusedLatestCard(scope, data.contest)}
    ${focusedPerformance(scope, data.backtests, data.realBets)}
    ${focusedRecentGames(scope, data.batches)}
  </div>`;
}

function renderAllDashboard(data) {
  const backtests = new Map(data.backtests);
  const realBets = new Map(data.realBets);

  root.innerHTML = `<div class="dashboard-shell is-all">
    <section class="dashboard-section">
      <div class="section-head dashboard-section-head"><div><h2>Últimos concursos</h2><p>Um resumo rápido das três loterias.</p></div></div>
      <div class="dashboard-lottery-grid">${data.contests.map(([lottery, contest]) => latestLotteryCard(lottery, contest)).join("")}</div>
    </section>
    <section class="dashboard-section">
      <div class="section-head dashboard-section-head"><div><h2>Desempenho</h2><p>Histórico e resultado real, lado a lado.</p></div></div>
      <div class="panel dashboard-performance-panel">${LOTTERY_IDS.map((lottery) => allPerformanceRow(lottery, backtests.get(lottery), realBets.get(lottery))).join("")}</div>
    </section>
    <section class="dashboard-section">
      <div class="section-head dashboard-section-head"><div><h2>Jogos recentes</h2><p>Atividade mais recente entre as loterias.</p></div></div>
      <div class="panel list dashboard-recent-list">${combinedBatchesMarkup(data.batches)}</div>
    </section>
  </div>`;
}

async function applyDashboardScope() {
  if (!root || !select || currentView() !== "dashboard") return;
  const token = ++applyToken;
  const scope = normalizeScope(select.value || savedScope());
  localStorage.setItem(DASHBOARD_SCOPE_KEY, scope);
  setHeader(scope);

  const data = scope === "all" ? await loadAllData() : await loadFocusedData(scope);
  if (token !== applyToken || currentView() !== "dashboard" || normalizeScope(select.value) !== scope) return;

  if (scope === "all") renderAllDashboard(data);
  else renderFocusedDashboard(scope, data);
}

function scheduleApply() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(async () => {
    scheduled = false;
    await applyDashboardScope();
  });
}

async function syncDashboardData() {
  if (!refreshButton || syncing || currentView() !== "dashboard") return;
  syncing = true;
  refreshButton.disabled = true;
  refreshButton.classList.add("is-spinning");
  setRefreshControl(true);

  try {
    await api("/operations/sync", { method: "POST" });
    window.dispatchEvent(new CustomEvent("loto-lab:data-synced"));
    toast("Dados atualizados.");
  } catch (error) {
    toast(error?.message || "Não foi possível atualizar os dados.", "error");
  } finally {
    syncing = false;
    refreshButton.disabled = false;
    refreshButton.classList.remove("is-spinning");
    setRefreshControl(currentView() === "dashboard");
  }
}

select?.addEventListener("change", () => {
  if (currentView() !== "dashboard" || navigatingFromDashboard) return;
  const scope = normalizeScope(select.value);
  localStorage.setItem(DASHBOARD_SCOPE_KEY, scope);
  scheduleApply();
});

refreshButton?.addEventListener("click", (event) => {
  if (currentView() !== "dashboard") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void syncDashboardData();
}, { capture: true });

root?.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest("[data-dashboard-open]");
  if (!button) return;
  const lottery = button.dataset.dashboardLottery;
  const view = button.dataset.dashboardOpen;
  if (!validLottery(lottery) || !view) return;

  const previousScope = savedScope();
  navigatingFromDashboard = true;
  select.value = lottery;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  navigatingFromDashboard = false;
  localStorage.setItem(DASHBOARD_SCOPE_KEY, previousScope);
  queueMicrotask(() => { location.hash = view; });
});

window.addEventListener("hashchange", syncScopeControl, { capture: true });
window.addEventListener("loto-lab:data-synced", scheduleApply);
onViewRendered(({ view }) => {
  if (view === "dashboard") scheduleApply();
});

syncScopeControl();
scheduleApply();
