const API = "/api/v1";

const LOTTERIES = {
  "mega-sena": {
    label: "Mega-Sena",
    defaultGames: 2,
    title: "Mega-Sena: núcleo fixo",
    description: "Compara 0, 2 e 3 dezenas fixas usando exatamente os mesmos concursos.",
  },
  lotofacil: {
    label: "Lotofácil",
    defaultGames: 4,
    title: "Lotofácil: tamanho do núcleo",
    description: "Compara 8, 9 e 10 dezenas fixas mantendo período, aquecimento e quantidade de jogos iguais.",
  },
  "dia-de-sorte": {
    label: "Dia de Sorte",
    defaultGames: 4,
    title: "Dia de Sorte: núcleo fixo",
    description: "Compara 0, 2 e 3 dezenas fixas sem alterar a lógica do Mês da Sorte.",
  },
};

const METRICS = {
  averageHitsPerGame: {
    label: "Média de acertos",
    format: (value) => value.toFixed(2).replace(".", ","),
    axis: (value) => value.toFixed(1).replace(".", ","),
  },
  prizeRate: {
    label: "Taxa de premiação",
    format: (value) => formatPercent(value),
    axis: (value) => `${Math.round(value * 100)}%`,
  },
  roi: {
    label: "ROI",
    format: (value) => formatPercent(value),
    axis: (value) => `${Math.round(value * 100)}%`,
  },
  netResult: {
    label: "Resultado líquido",
    format: (value) => formatCurrency(value),
    axis: (value) => compactCurrency(value),
  },
};

const lotterySelect = document.querySelector("#lab-lottery");
const form = document.querySelector("#lab-form");
const gamesInput = document.querySelector("#lab-games");
const lookbackInput = document.querySelector("#lab-lookback");
const bucketInput = document.querySelector("#lab-bucket");
const warmupInput = document.querySelector("#lab-warmup");
const runButton = document.querySelector("#lab-run");
const title = document.querySelector("#lab-title");
const description = document.querySelector("#lab-description");
const historyStatus = document.querySelector("#lab-history-status");
const apiStatus = document.querySelector("#lab-api-status");
const message = document.querySelector("#lab-message");
const resultsRoot = document.querySelector("#lab-results");
const rankingRoot = document.querySelector("#lab-ranking");
const basis = document.querySelector("#lab-basis");
const periodCopy = document.querySelector("#lab-period-copy");
const tableBody = document.querySelector("#lab-table-body");
const chartRoot = document.querySelector("#lab-chart");
const metricSelect = document.querySelector("#lab-metric");

let currentResult;
let dataStatus;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1).replace(".", ",")}%`;
}

function formatCurrency(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function compactCurrency(value) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toFixed(1).replace(".", ",")} mil`;
  return `${sign}R$ ${abs.toFixed(0)}`;
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: options.body
      ? { "Content-Type": "application/json", ...(options.headers || {}) }
      : options.headers,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Erro HTTP ${response.status}`);
    error.code = payload?.error?.code || "HTTP_ERROR";
    throw error;
  }
  return payload;
}

function setMessage(kind, heading, copy) {
  message.className = `lab-message panel${kind ? ` is-${kind}` : ""}`;
  message.innerHTML = `<strong>${escapeHtml(heading)}</strong><p>${escapeHtml(copy)}</p>`;
}

function selectedLottery() {
  return lotterySelect.value;
}

function updateLotteryCopy(resetGames = false) {
  const config = LOTTERIES[selectedLottery()];
  title.textContent = config.title;
  description.textContent = config.description;
  if (resetGames) gamesInput.value = String(config.defaultGames);
  localStorage.setItem("loto-lab:lottery", selectedLottery());
  currentResult = undefined;
  resultsRoot.hidden = true;
  setMessage("", "Pronto para comparar", "Escolha o período e execute. O laboratório não altera a metodologia principal nem salva um vencedor automaticamente.");
  renderHistoryStatus();
}

async function checkHealth() {
  try {
    const response = await fetch("/health/ready");
    if (!response.ok) throw new Error();
    apiStatus.className = "status-row is-ok";
    apiStatus.querySelector("span:last-child").textContent = "API e banco online";
  } catch {
    apiStatus.className = "status-row is-error";
    apiStatus.querySelector("span:last-child").textContent = "API indisponível";
  }
}

async function loadDataStatus() {
  try {
    dataStatus = await api("/data/status");
  } catch {
    dataStatus = undefined;
  }
  renderHistoryStatus();
}

function renderHistoryStatus() {
  if (!dataStatus?.items) {
    historyStatus.className = "lab-history-status is-warning";
    historyStatus.textContent = "Não foi possível ler a cobertura histórica.";
    return;
  }

  const item = dataStatus.items.find((entry) => entry.lottery === selectedLottery());
  if (!item) {
    historyStatus.className = "lab-history-status is-warning";
    historyStatus.textContent = "Sem histórico armazenado para esta loteria.";
    return;
  }

  const complete = item.missingContestCount === 0 && item.contestCount >= 30;
  historyStatus.className = `lab-history-status ${complete ? "is-ok" : "is-warning"}`;
  historyStatus.innerHTML = `<strong>${item.contestCount.toLocaleString("pt-BR")} concursos</strong><br>${item.missingContestCount} lacuna(s) · ${formatPercent(item.financialCoverage)} com rateio`;
}

function rankingPrimary(variant, rankingBasis) {
  if (rankingBasis === "roi") {
    return { label: "ROI", value: formatPercent(variant.summary.roi), raw: variant.summary.roi };
  }
  return { label: "Taxa de premiação", value: formatPercent(variant.summary.prizeRate), raw: variant.summary.prizeRate };
}

function renderRanking(result) {
  rankingRoot.innerHTML = result.variants.map((variant, index) => {
    const primary = rankingPrimary(variant, result.rankingBasis);
    const tone = primary.raw >= 0 ? "positive" : "negative";
    const winner = index === 0;
    return `<article class="panel lab-strategy-card ${winner ? "is-winner" : ""}">
      <div class="lab-rank-row"><span class="lab-rank-number">${index + 1}</span><span class="badge ${winner ? "positive" : ""}">${winner ? "melhor no período" : `${variant.fixedCount} fixas`}</span></div>
      <h3>${escapeHtml(variant.label)}</h3>
      <p>${variant.summary.testedContests} concursos · ${variant.summary.totalGames} jogos simulados</p>
      <div class="lab-primary-metric"><span>${primary.label}</span><strong class="${tone}">${primary.value}</strong></div>
      <div class="lab-mini-metrics">
        <div class="lab-mini-metric"><span>Acertos médios</span><strong>${variant.summary.averageHitsPerGame.toFixed(2).replace(".", ",")}</strong></div>
        <div class="lab-mini-metric"><span>Melhor</span><strong>${variant.summary.maxHits}</strong></div>
        <div class="lab-mini-metric"><span>Cobertura</span><strong>${formatPercent(variant.summary.financialCoverage)}</strong></div>
      </div>
    </article>`;
  }).join("");
}

function renderTable(result) {
  tableBody.innerHTML = result.variants.map((variant, index) => {
    const winnerClass = index === 0 ? "lab-winner-cell" : "";
    const roiClass = variant.summary.roi >= 0 ? "positive" : "negative";
    return `<tr>
      <td class="${winnerClass}"><span class="lab-table-rank">${index + 1}</span><strong>${escapeHtml(variant.label)}</strong></td>
      <td>${variant.summary.averageHitsPerGame.toFixed(2).replace(".", ",")}</td>
      <td>${variant.summary.averageFixedHitsPerContest.toFixed(2).replace(".", ",")}</td>
      <td><strong>${variant.summary.maxHits}</strong></td>
      <td>${formatPercent(variant.summary.prizeRate)}</td>
      <td>${formatPercent(variant.summary.financialCoverage)}</td>
      <td><strong class="${roiClass}">${formatPercent(variant.summary.roi)}</strong></td>
      <td>${formatCurrency(variant.summary.netResult)}</td>
    </tr>`;
  }).join("");
}

function chartValue(point, metric) {
  const value = point?.[metric];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function renderChart() {
  if (!currentResult) return;
  const metric = metricSelect.value;
  const metricConfig = METRICS[metric];
  const variants = currentResult.variants;
  const allValues = variants.flatMap((variant) => variant.series.map((point) => chartValue(point, metric)));
  const maxPoints = Math.max(0, ...variants.map((variant) => variant.series.length));

  if (allValues.length === 0 || maxPoints === 0) {
    chartRoot.innerHTML = '<div class="lab-chart-empty">Sem pontos suficientes para este gráfico.</div>';
    return;
  }

  let min = Math.min(...allValues);
  let max = Math.max(...allValues);
  if (min === max) {
    const delta = Math.abs(min) > 1 ? Math.abs(min) * 0.1 : 1;
    min -= delta;
    max += delta;
  } else {
    const padding = (max - min) * 0.08;
    min -= padding;
    max += padding;
  }

  const width = 1000;
  const height = 300;
  const left = 70;
  const right = 20;
  const top = 18;
  const bottom = 46;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xFor = (index) => left + (maxPoints <= 1 ? plotWidth / 2 : (index / (maxPoints - 1)) * plotWidth);
  const yFor = (value) => top + ((max - value) / (max - min)) * plotHeight;

  const tickCount = 5;
  const grid = Array.from({ length: tickCount }, (_, index) => {
    const ratio = index / (tickCount - 1);
    const value = max - ratio * (max - min);
    const y = top + ratio * plotHeight;
    return `<line class="lab-chart-grid" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"/><text class="lab-chart-axis" x="${left - 10}" y="${y + 3}" text-anchor="end">${escapeHtml(metricConfig.axis(value))}</text>`;
  }).join("");

  const zeroLine = min < 0 && max > 0
    ? `<line class="lab-chart-zero" x1="${left}" y1="${yFor(0)}" x2="${width - right}" y2="${yFor(0)}"/>`
    : "";

  const lines = variants.map((variant, variantIndex) => {
    const points = variant.series.map((point, index) => `${xFor(index)},${yFor(chartValue(point, metric))}`).join(" ");
    const dots = variant.series.map((point, index) => `<circle class="lab-point-${variantIndex}" cx="${xFor(index)}" cy="${yFor(chartValue(point, metric))}" r="3"/>`).join("");
    return `<polyline class="lab-series lab-series-${variantIndex}" points="${points}"/>${dots}`;
  }).join("");

  const referenceSeries = variants[0]?.series || [];
  const labelIndexes = [...new Set([0, Math.floor((maxPoints - 1) / 2), maxPoints - 1])].filter((index) => index >= 0);
  const xLabels = labelIndexes.map((index) => {
    const point = referenceSeries[index];
    if (!point) return "";
    return `<text class="lab-chart-axis" x="${xFor(index)}" y="${height - 14}" text-anchor="middle">#${point.startContest}–${point.endContest}</text>`;
  }).join("");

  const legend = variants.map((variant, index) => `<span class="lab-legend-item"><span class="lab-legend-dot series-${index}"></span>${escapeHtml(variant.label)}</span>`).join("");

  chartRoot.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(metricConfig.label)} por bloco de concursos">${grid}${zeroLine}${lines}${xLabels}</svg><div class="lab-chart-legend">${legend}</div>`;
}

function renderResult(result) {
  currentResult = result;
  resultsRoot.hidden = false;
  message.hidden = true;
  basis.textContent = result.rankingBasis === "roi" ? "Ranking por ROI" : "Ranking por taxa de premiação";
  periodCopy.textContent = `Concursos #${result.startContest ?? "—"} a #${result.endContest ?? "—"} · ${result.gameCount} jogo(s) por concurso · blocos de ${result.bucketSize}`;
  metricSelect.value = result.rankingBasis === "roi" ? "roi" : "prizeRate";
  renderRanking(result);
  renderTable(result);
  renderChart();
}

async function runComparison(event) {
  event?.preventDefault();
  runButton.disabled = true;
  runButton.textContent = "Comparando...";
  message.hidden = false;
  resultsRoot.hidden = true;
  setMessage("running", "Executando backtests", "As três variantes estão sendo calculadas sobre o mesmo período. Isso pode levar alguns segundos.");

  try {
    const payload = await api("/lab/compare", {
      method: "POST",
      body: JSON.stringify({
        lottery: selectedLottery(),
        gameCount: Number(gamesInput.value),
        warmupContests: Number(warmupInput.value),
        lookbackContests: Number(lookbackInput.value),
        bucketSize: Number(bucketInput.value),
      }),
    });
    renderResult(payload);
  } catch (error) {
    resultsRoot.hidden = true;
    message.hidden = false;
    setMessage("error", error.code === "INSUFFICIENT_HISTORY" ? "Histórico insuficiente" : "Comparação não concluída", error.message);
  } finally {
    runButton.disabled = false;
    runButton.textContent = "Executar comparação";
  }
}

lotterySelect.addEventListener("change", () => updateLotteryCopy(true));
form.addEventListener("submit", runComparison);
metricSelect.addEventListener("change", renderChart);

const savedLottery = localStorage.getItem("loto-lab:lottery");
if (savedLottery && LOTTERIES[savedLottery]) lotterySelect.value = savedLottery;
gamesInput.value = String(LOTTERIES[selectedLottery()].defaultGames);
updateLotteryCopy(false);
checkHealth();
loadDataStatus();
