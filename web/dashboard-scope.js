import {
  api,
  escapeHtml,
  formatCurrency,
  formatDateTime,
  formatPercent,
  onViewRendered,
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
let applyToken = 0;
let scheduled = false;
let navigatingFromDashboard = false;

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

function syncScopeControl() {
  if (!select) return;
  if (currentView() === "dashboard") {
    ensureAllOption();
    if (selectLabel) selectLabel.textContent = "Escopo";
    select.value = savedScope();
    return;
  }

  removeAllOption();
  if (selectLabel) selectLabel.textContent = "Loteria";
  select.value = savedLottery();
}

function sectionList() {
  root?.querySelector(".real-performance-section")?.remove();
  return [...(root?.querySelectorAll(":scope > .stack > section") || [])];
}

function setHeader(scope) {
  if (!title || !subtitle) return;
  if (scope === "all") {
    title.textContent = "Dashboard";
    subtitle.textContent = "Visão comparativa dos concursos, jogos e desempenho.";
    return;
  }
  title.textContent = `Dashboard · ${LOTTERIES[scope]}`;
  subtitle.textContent = "Visão focada nos concursos, jogos e desempenho desta loteria.";
}

function metric(label, value, detail = "", tone = "") {
  return `<article class="panel metric-card"><span class="metric-label">${escapeHtml(label)}</span><strong class="metric-value ${tone}">${value}</strong><span class="metric-detail">${escapeHtml(detail)}</span></article>`;
}

function comparisonMetric(label, value, tone = "") {
  return `<span><small>${escapeHtml(label)}</small><strong class="${tone}">${value}</strong></span>`;
}

function backtestComparisonCard(lottery, data) {
  const backtest = data?.items?.[0];
  const summary = backtest?.summary || {};
  const roiTone = typeof summary.roi === "number" ? (summary.roi >= 0 ? "positive" : "negative") : "";
  return `<article class="panel dashboard-comparison-card">
    <div class="dashboard-comparison-head"><div><strong>${LOTTERIES[lottery]}</strong><span>${backtest ? `Backtest #${backtest.id}` : "Sem backtest"}</span></div><button class="button compact ghost" type="button" data-dashboard-open="backtests" data-dashboard-lottery="${lottery}">Abrir</button></div>
    <div class="dashboard-comparison-metrics">
      ${comparisonMetric("ROI", formatPercent(summary.roi), roiTone)}
      ${comparisonMetric("Cobertura", formatPercent(summary.financialCoverage))}
      ${comparisonMetric("Melhor", summary.bestHits ?? "—")}
      ${comparisonMetric("Prêmios", formatCurrency(summary.totalPrizeValue))}
    </div>
  </article>`;
}

function realComparisonCard(lottery, data) {
  const summary = data?.summary || {};
  const roiTone = typeof summary.roi === "number" ? (summary.roi >= 0 ? "positive" : "negative") : "";
  const net = Number(summary.netResult || 0);
  return `<article class="panel dashboard-comparison-card">
    <div class="dashboard-comparison-head"><div><strong>${LOTTERIES[lottery]}</strong><span>${summary.checkedBets || 0} conferida(s) · ${summary.pendingBets || 0} pendente(s)</span></div></div>
    <div class="dashboard-comparison-metrics">
      ${comparisonMetric("ROI real", formatPercent(summary.roi), roiTone)}
      ${comparisonMetric("Gasto", formatCurrency(summary.actualCost || 0))}
      ${comparisonMetric("Prêmios", formatCurrency(summary.totalPrizeValue || 0))}
      ${comparisonMetric("Líquido", formatCurrency(net), net >= 0 ? "positive" : "negative")}
    </div>
  </article>`;
}

function emptyState(titleText, copy) {
  return `<div class="empty-state"><strong>${escapeHtml(titleText)}</strong><p>${escapeHtml(copy)}</p></div>`;
}

function combinedBatchesMarkup(entries) {
  const batches = entries
    .flatMap(([lottery, data]) => (data?.items || []).map((batch) => ({ ...batch, lottery: batch.lottery || lottery })))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  if (!batches.length) {
    return emptyState("Nenhum lote salvo", "Gere seu primeiro conjunto de jogos para começar o histórico.");
  }

  return batches.map((batch) => `<div class="list-row">
    <div class="list-row-main"><strong>${LOTTERIES[batch.lottery] || batch.lottery} · Lote #${batch.id}</strong><p>${batch.games?.length || 0} jogo(s) · alvo ${batch.targetContestNumber ? `#${batch.targetContestNumber}` : "não definido"}</p></div>
    <div class="list-row-value"><strong>${formatDateTime(batch.createdAt)}</strong><button class="dashboard-row-action" type="button" data-dashboard-open="games" data-dashboard-lottery="${batch.lottery}">Abrir jogos</button></div>
  </div>`).join("");
}

function focusLatestContest(scope, section) {
  const cards = [...(section?.querySelectorAll(".lottery-card") || [])];
  cards.forEach((card) => {
    const name = card.querySelector(".lottery-name")?.textContent?.trim();
    card.hidden = scope !== "all" && name !== LOTTERIES[scope];
  });
  section?.classList.toggle("dashboard-focus-section", scope !== "all");
  const heading = section?.querySelector(".section-head h2");
  if (heading) heading.textContent = scope === "all" ? "Últimos concursos" : "Último concurso";
}

async function loadAllDashboardData() {
  const [backtests, realBets, batches] = await Promise.all([
    Promise.all(LOTTERY_IDS.map(async (lottery) => [lottery, await api(`/backtests/${lottery}?limit=1`).catch(() => ({ items: [] }))])),
    Promise.all(LOTTERY_IDS.map(async (lottery) => [lottery, await api(`/real-bets/${lottery}?limit=50`).catch(() => ({ items: [], summary: {} }))])),
    Promise.all(LOTTERY_IDS.map(async (lottery) => [lottery, await api(`/game-batches/${lottery}?limit=3`).catch(() => ({ items: [] }))])),
  ]);
  return { backtests, realBets, batches };
}

async function loadRealPerformance(lottery) {
  return api(`/real-bets/${lottery}?limit=50`).catch(() => ({ items: [], summary: {} }));
}

function realPerformanceSection(scope, data) {
  const section = document.createElement("section");
  section.className = "real-performance-section";
  if (scope === "all") {
    section.innerHTML = `<div class="section-head"><div><h2>Desempenho real</h2><p>Comparativo das apostas efetivamente realizadas nas três loterias.</p></div></div><div class="dashboard-comparison-grid">${data.map(([lottery, item]) => realComparisonCard(lottery, item)).join("")}</div>`;
    return section;
  }

  const summary = data?.summary || {};
  const roiTone = typeof summary.roi === "number" ? (summary.roi >= 0 ? "positive" : "negative") : "";
  const net = Number(summary.netResult || 0);
  section.innerHTML = `<div class="section-head"><div><h2>Desempenho real</h2><p>Apenas apostas marcadas como realmente realizadas · não inclui backtests.</p></div></div><div class="grid cols-4">
    ${metric("ROI real", formatPercent(summary.roi), `${summary.checkedBets || 0} aposta(s) conferida(s)`, roiTone)}
    ${metric("Gasto real", formatCurrency(summary.actualCost || 0), `${summary.pendingBets || 0} aguardando resultado`)}
    ${metric("Prêmios reais", formatCurrency(summary.totalPrizeValue || 0), "Retorno das apostas conferidas")}
    ${metric("Resultado líquido", formatCurrency(net), "Prêmios menos custo conferido", net >= 0 ? "positive" : "negative")}
  </div>`;
  return section;
}

async function applyDashboardScope() {
  if (!root || !select || currentView() !== "dashboard") return;
  const token = ++applyToken;
  const scope = normalizeScope(select.value || savedScope());
  localStorage.setItem(DASHBOARD_SCOPE_KEY, scope);
  setHeader(scope);

  const sections = sectionList();
  const latestSection = sections[0];
  const recentSection = sections[1];
  const batchesSection = sections[2];
  if (!latestSection || !recentSection || !batchesSection) return;

  focusLatestContest(scope, latestSection);

  if (scope === "all") {
    const data = await loadAllDashboardData();
    if (token !== applyToken || currentView() !== "dashboard" || select.value !== "all") return;

    recentSection.innerHTML = `<div class="section-head"><div><h2>Desempenho recente</h2><p>Último backtest persistido de cada loteria.</p></div></div><div class="dashboard-comparison-grid">${data.backtests.map(([lottery, item]) => backtestComparisonCard(lottery, item)).join("")}</div>`;
    batchesSection.innerHTML = `<div class="section-head"><div><h2>Jogos recentes</h2><p>Últimos lotes gerados nas três loterias.</p></div></div><div class="panel list">${combinedBatchesMarkup(data.batches)}</div>`;
    root.querySelector(".real-performance-section")?.remove();
    recentSection.insertAdjacentElement("afterend", realPerformanceSection(scope, data.realBets));
    return;
  }

  const recentHeading = recentSection.querySelector(".section-head h2");
  const batchesHeading = batchesSection.querySelector(".section-head h2");
  if (recentHeading) recentHeading.textContent = "Desempenho recente";
  if (batchesHeading) batchesHeading.textContent = "Jogos recentes";

  const real = await loadRealPerformance(scope);
  if (token !== applyToken || currentView() !== "dashboard" || select.value !== scope) return;
  root.querySelector(".real-performance-section")?.remove();
  recentSection.insertAdjacentElement("afterend", realPerformanceSection(scope, real));
}

function scheduleApply() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(async () => {
    scheduled = false;
    await applyDashboardScope();
  });
}

select?.addEventListener("change", () => {
  if (currentView() !== "dashboard" || navigatingFromDashboard) return;
  const scope = normalizeScope(select.value);
  localStorage.setItem(DASHBOARD_SCOPE_KEY, scope);
  scheduleApply();
});

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
document.querySelector("#refresh-view")?.addEventListener("click", scheduleApply);
onViewRendered(({ view }) => {
  if (view === "dashboard") scheduleApply();
});

syncScopeControl();
scheduleApply();
