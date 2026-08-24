const API = "/api/v1";

const LOTTERIES = {
  "mega-sena": {
    label: "Mega-Sena",
    defaultGames: 2,
    fixedCopy: "Compara 0, 2 e 3 dezenas fixas usando exatamente os mesmos concursos.",
  },
  lotofacil: {
    label: "Lotofácil",
    defaultGames: 4,
    fixedCopy: "Compara 8, 9 e 10 dezenas fixas mantendo período, aquecimento e quantidade de jogos iguais.",
  },
  "dia-de-sorte": {
    label: "Dia de Sorte",
    defaultGames: 4,
    fixedCopy: "Compara 0, 2 e 3 dezenas fixas sem alterar a lógica do Mês da Sorte.",
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
const formGrid = form.querySelector(".lab-form-grid");
const experimentField = document.createElement("div");
experimentField.className = "field lab-experiment-field";
experimentField.innerHTML = `
  <label for="lab-experiment">Experimento</label>
  <select id="lab-experiment">
    <option value="fixed-core">Núcleo fixo</option>
    <option value="score-model">Score v1 × v2 × sem score</option>
    <option value="external-rules">Regras externas (Mega-Sena)</option>
  </select>`;
formGrid.prepend(experimentField);

const experimentSelect = experimentField.querySelector("#lab-experiment");
const gamesInput = document.querySelector("#lab-games");
const lookbackInput = document.querySelector("#lab-lookback");
const bucketInput = document.querySelector("#lab-bucket");
const warmupInput = document.querySelector("#lab-warmup");
const randomSamplesInput = document.querySelector("#lab-random-samples");
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

function formatPercentagePoints(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const points = value * 100;
  return `${points > 0 ? "+" : ""}${points.toFixed(1).replace(".", ",")} p.p.`;
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

function formatAuc(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(3).replace(".", ",")
    : "—";
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

function selectedExperiment() {
  return experimentSelect.value;
}

function minimumPracticalRandomSamples(experiment) {
  return experiment === "external-rules" ? 250 : 100;
}

function ensureInferenceResolution(experiment) {
  const minimum = minimumPracticalRandomSamples(experiment);
  if (Number(randomSamplesInput.value) < minimum) randomSamplesInput.value = String(minimum);
}

function updateLotteryCopy(resetGames = false) {
  const lottery = selectedLottery();
  const config = LOTTERIES[lottery];
  const externalOption = experimentSelect.querySelector('option[value="external-rules"]');
  if (externalOption) externalOption.disabled = lottery !== "mega-sena";
  if (lottery !== "mega-sena" && experimentSelect.value === "external-rules") {
    experimentSelect.value = "fixed-core";
  }

  const experiment = selectedExperiment();
  ensureInferenceResolution(experiment);
  if (experiment === "score-model") {
    title.textContent = `${config.label}: Score v1 × Score v2 × sem score`;
    description.textContent = "Isola o valor do ranking, mede AUC fora da amostra e faz walk-forward sem olhar concursos futuros.";
  } else if (experiment === "external-rules") {
    title.textContent = "Mega-Sena: validação de regras externas";
    description.textContent = "Testa regras como hipóteses separadas e corrige a evidência pela quantidade de variantes comparadas. O modo usa pelo menos 250 controles para ter resolução inferencial suficiente.";
  } else {
    title.textContent = `${config.label}: tamanho do núcleo`;
    description.textContent = config.fixedCopy;
  }

  if (resetGames) gamesInput.value = String(config.defaultGames);
  localStorage.setItem("loto-lab:lottery", lottery);
  currentResult = undefined;
  resultsRoot.hidden = true;
  message.hidden = false;
  setMessage(
    "",
    "Pronto para comparar",
    "A evidência exige resolução Monte Carlo suficiente, pelo menos 30 concursos elegíveis, trata empates de forma neutra e ajusta falsos positivos quando várias estratégias são testadas.",
  );
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
  return {
    label: "Taxa de premiação",
    value: formatPercent(variant.summary.prizeRate),
    raw: variant.summary.prizeRate,
  };
}

function variantBadge(result, variant, index) {
  if (index === 0) return "melhor no período";
  if (result.experiment === "score-model") return variant.analysisModel || "modelo";
  if (result.experiment === "external-rules") return "regra experimental";
  return `${variant.fixedCount} fixas`;
}

function statusCopy(benchmark) {
  if (benchmark.status === "beats-random") {
    return {
      label: "Evidência acima do random",
      tone: "positive",
      copy: "A cauda superior permanece significativa após corrigir o número de variantes testadas.",
    };
  }
  if (benchmark.status === "insufficient-resolution") {
    return {
      label: "Resolução insuficiente",
      tone: "warning",
      copy: `Com ${benchmark.distribution.samples} controles, o menor p ajustado possível é ${formatPercent(benchmark.minimumAchievableAdjustedPValue)}. São necessários pelo menos ${benchmark.minimumRandomSamples} controles para tornar 5% matematicamente atingível.`,
    };
  }
  if (benchmark.status === "insufficient-sample") {
    return {
      label: "Amostra histórica pequena",
      tone: "warning",
      copy: `O recorte possui ${benchmark.observationRounds} concursos elegíveis; o mínimo inferencial é ${benchmark.minimumObservationRounds}. O resultado permanece exploratório.`,
    };
  }
  if (benchmark.status === "inconclusive") {
    return {
      label: "Inconclusivo",
      tone: "warning",
      copy: "Há sinal exploratório, mas ele não passa o limiar ajustado de evidência.",
    };
  }
  if (benchmark.status === "underperforms-random") {
    return {
      label: "Evidência abaixo do random",
      tone: "negative",
      copy: "A cauda inferior permanece significativa após a correção por múltiplas comparações.",
    };
  }
  return {
    label: "Sem evidência",
    tone: "neutral",
    copy: "Com resolução e amostra suficientes, o resultado está compatível com o comportamento dos controles aleatórios neste recorte.",
  };
}

function renderPredictiveEvidence(result) {
  if (!Array.isArray(result.rankingQuality) || result.rankingQuality.length === 0) return "";

  const qualityCards = result.rankingQuality.map((item) => {
    const delta = item.quality.deltaFromRandom;
    const tone = delta > 0.01 ? "positive" : delta < -0.01 ? "negative" : "neutral";
    return `<div class="lab-evidence-card is-${tone}">
      <span>${escapeHtml(item.label)}</span>
      <strong>AUC ${formatAuc(item.quality.auc)}</strong>
      <small>${formatPercentagePoints(delta)} vs 0,500 · ${item.quality.rounds} concursos</small>
    </div>`;
  }).join("");

  const walk = result.walkForward;
  const walkMarkup = walk ? `<div class="lab-walk-forward">
    <div>
      <span class="lab-eyebrow">Otimização walk-forward</span>
      <strong>${formatAuc(walk.tunedAuc)} AUC otimizado vs ${formatAuc(walk.defaultAuc)} padrão</strong>
      <p>${walk.folds.length} folds · ${walk.totalTestRounds} concursos fora da amostra. Os pesos são escolhidos no passado e congelados no bloco seguinte.</p>
    </div>
    <div class="lab-null-box">
      <span>Ganho observado</span>
      <strong>${formatPercentagePoints(walk.deltaVsDefault)}</strong>
      <small>Null P05 ${formatPercentagePoints(walk.nullBenchmark.p05)} · P95 ${formatPercentagePoints(walk.nullBenchmark.p95)} · p bilateral ${formatPercent(walk.nullBenchmark.twoSidedPValue)}</small>
    </div>
  </div>` : "";

  return `<section class="panel lab-predictive-evidence">
    <div class="lab-evidence-head"><div>
      <span class="lab-eyebrow">Qualidade preditiva</span>
      <strong>O ranking colocou os números sorteados acima dos não sorteados?</strong>
      <p>AUC 0,500 equivale a ordenação sem informação. Concursos com lacuna no predecessor são excluídos da validação.</p>
    </div></div>
    <div class="lab-evidence-grid">${qualityCards}</div>
    ${walkMarkup}
  </section>`;
}

function renderBenchmark(result) {
  const benchmark = result.benchmark;
  const bestStrategy = result.variants.find((variant) => variant.key === benchmark.bestStrategyKey);
  if (!bestStrategy) return "";

  const status = statusCopy(benchmark);
  const metricLabel = benchmark.basis === "roi" ? "ROI" : "taxa de premiação";
  return `<article class="panel lab-benchmark-card is-${status.tone}">
    <div class="lab-benchmark-main">
      <span class="lab-eyebrow">Benchmark · ${benchmark.distribution.samples} controles · ${benchmark.familySize} variante(s) · ${benchmark.observationRounds} concursos elegíveis</span>
      <strong>${escapeHtml(bestStrategy.label)} · ${status.label}</strong>
      <p>${escapeHtml(status.copy)} Percentil mid-rank ${formatPercent(benchmark.strategyPercentile)}; diferença para a mediana da distribuição: ${formatPercentagePoints(benchmark.medianDelta)} em ${metricLabel}. p ajustado: ${formatPercent(benchmark.adjustedPValue)}.</p>
    </div>
    <div class="lab-distribution">
      <div><span>P05</span><strong>${formatPercent(benchmark.distribution.p05)}</strong></div>
      <div><span>P50</span><strong>${formatPercent(benchmark.distribution.p50)}</strong></div>
      <div><span>P95</span><strong>${formatPercent(benchmark.distribution.p95)}</strong></div>
      <div class="is-strategy"><span>Estratégia</span><strong>${formatPercent(rankingPrimary(bestStrategy, benchmark.basis).raw)}</strong></div>
    </div>
  </article>`;
}

function renderRanking(result) {
  const cards = result.variants.map((variant, index) => {
    const primary = rankingPrimary(variant, result.rankingBasis);
    const tone = primary.raw >= 0 ? "positive" : "negative";
    const winner = index === 0;
    return `<article class="panel lab-strategy-card ${winner ? "is-winner" : ""}">
      <div class="lab-rank-row">
        <span class="lab-rank-number">${index + 1}</span>
        <span class="badge ${winner ? "positive" : ""}">${escapeHtml(variantBadge(result, variant, index))}</span>
      </div>
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

  rankingRoot.innerHTML = `${renderBenchmark(result)}${cards}${renderPredictiveEvidence(result)}`;
}

function renderTable(result) {
  const control = result.benchmark.medianControl;
  const rows = [...result.variants, control];
  tableBody.innerHTML = rows.map((variant, index) => {
    const isControl = variant.key === control.key;
    const winnerClass = index === 0 && !isControl ? "lab-winner-cell" : "";
    const roiClass = variant.summary.roi >= 0 ? "positive" : "negative";
    const fixedAverage = isControl || result.experiment === "external-rules"
      ? "—"
      : variant.summary.averageFixedHitsPerContest.toFixed(2).replace(".", ",");
    return `<tr class="${isControl ? "lab-control-row" : ""}">
      <td class="${winnerClass}"><span class="lab-table-rank">${isControl ? "C" : index + 1}</span><strong>${escapeHtml(variant.label)}</strong>${isControl ? ' <span class="badge">amostra próxima da mediana</span>' : ""}</td>
      <td>${variant.summary.averageHitsPerGame.toFixed(2).replace(".", ",")}</td>
      <td>${fixedAverage}</td>
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
  const strategyVariants = currentResult.experiment === "external-rules"
    ? currentResult.variants.slice(0, 3)
    : currentResult.variants;
  const control = currentResult.benchmark.medianControl;
  const variants = [...strategyVariants, control];
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

  const grid = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const value = max - ratio * (max - min);
    const y = top + ratio * plotHeight;
    return `<line class="lab-chart-grid" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"/><text class="lab-chart-axis" x="${left - 10}" y="${y + 3}" text-anchor="end">${escapeHtml(metricConfig.axis(value))}</text>`;
  }).join("");

  const zeroLine = min < 0 && max > 0
    ? `<line class="lab-chart-zero" x1="${left}" y1="${yFor(0)}" x2="${width - right}" y2="${yFor(0)}"/>`
    : "";

  const lines = variants.map((variant, variantIndex) => {
    const isControl = variant.key === control.key;
    const points = variant.series
      .map((point, index) => `${xFor(index)},${yFor(chartValue(point, metric))}`)
      .join(" ");
    const dots = variant.series
      .map((point, index) => `<circle class="lab-point-${variantIndex}" cx="${xFor(index)}" cy="${yFor(chartValue(point, metric))}" r="3"/>`)
      .join("");
    return `<polyline class="lab-series lab-series-${variantIndex}${isControl ? " lab-series-control" : ""}" points="${points}"/>${dots}`;
  }).join("");

  const referenceSeries = variants[0]?.series || [];
  const labelIndexes = [...new Set([0, Math.floor((maxPoints - 1) / 2), maxPoints - 1])]
    .filter((index) => index >= 0);
  const xLabels = labelIndexes.map((index) => {
    const point = referenceSeries[index];
    return point
      ? `<text class="lab-chart-axis" x="${xFor(index)}" y="${height - 14}" text-anchor="middle">#${point.startContest}–${point.endContest}</text>`
      : "";
  }).join("");
  const legend = variants.map((variant, index) =>
    `<span class="lab-legend-item"><span class="lab-legend-dot series-${index}"></span>${escapeHtml(variant.label)}${variant.key === control.key ? " · benchmark" : ""}</span>`,
  ).join("");

  chartRoot.innerHTML = `
    <div class="lab-chart-top-note">Linha tracejada: amostra aleatória próxima da mediana da distribuição. O P50 real é calculado sobre a distribuição inteira.</div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(metricConfig.label)} por bloco de concursos">${grid}${zeroLine}${lines}${xLabels}</svg>
    <div class="lab-chart-legend">${legend}</div>`;
}

function renderResult(result) {
  currentResult = result;
  resultsRoot.hidden = false;
  message.hidden = true;
  basis.textContent = result.rankingBasis === "roi" ? "Ranking por ROI" : "Ranking por taxa de premiação";
  const experimentCopy = result.experiment === "external-rules"
    ? "regras externas"
    : result.experiment === "score-model"
      ? "modelos de score"
      : "núcleo fixo";
  periodCopy.textContent = `Concursos #${result.startContest ?? "—"} a #${result.endContest ?? "—"} · ${result.gameCount} jogo(s) por concurso · ${experimentCopy} · ${result.randomSamples} controles aleatórios · blocos de ${result.bucketSize}`;
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
  setMessage(
    "running",
    "Executando backtests",
    "Estratégias, AUC e controles aleatórios usam somente a informação disponível antes de cada concurso elegível.",
  );

  try {
    const payload = await api("/lab/compare", {
      method: "POST",
      body: JSON.stringify({
        lottery: selectedLottery(),
        experiment: selectedExperiment(),
        gameCount: Number(gamesInput.value),
        warmupContests: Number(warmupInput.value),
        lookbackContests: Number(lookbackInput.value),
        bucketSize: Number(bucketInput.value),
        randomSamples: Number(randomSamplesInput.value),
      }),
    });
    renderResult(payload);
  } catch (error) {
    resultsRoot.hidden = true;
    message.hidden = false;
    const heading = error.code === "INSUFFICIENT_HISTORY"
      ? "Histórico insuficiente"
      : error.code === "EMPTY_PERIOD"
        ? "Período sem concursos elegíveis"
        : error.code === "ANALYSIS_TOO_LARGE"
          ? "Análise grande demais"
          : error.code === "ANALYSIS_TIMEOUT"
            ? "Limite de execução atingido"
            : "Comparação não concluída";
    setMessage("error", heading, error.message);
  } finally {
    runButton.disabled = false;
    runButton.textContent = "Executar comparação";
  }
}

lotterySelect.addEventListener("change", () => updateLotteryCopy(true));
experimentSelect.addEventListener("change", () => updateLotteryCopy(false));
form.addEventListener("submit", runComparison);
metricSelect.addEventListener("change", renderChart);

const savedLottery = localStorage.getItem("loto-lab:lottery");
if (savedLottery && LOTTERIES[savedLottery]) lotterySelect.value = savedLottery;
gamesInput.value = String(LOTTERIES[selectedLottery()].defaultGames);
updateLotteryCopy(false);
checkHealth();
loadDataStatus();
