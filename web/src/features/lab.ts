import { ApiError, api } from "../core/api.js";
import { escapeHtml } from "../shared/escaping.js";
import { formatCurrency, formatPercent } from "../shared/formatters.js";

type LotteryId = "mega-sena" | "lotofacil" | "dia-de-sorte";
type LabExperiment = "fixed-core" | "score-model" | "external-rules";
type RankingBasis = "roi" | "prizeRate";
type MetricKey = "averageHitsPerGame" | "prizeRate" | "roi" | "netResult";
type MessageKind = "" | "running" | "error";

type LotteryConfig = {
  label: string;
  defaultGames: number;
  fixedCopy: string;
};

type MetricConfig = {
  label: string;
  axis: (value: number) => string;
};

type DataStatusItem = {
  lottery?: string;
  contestCount?: unknown;
  missingContestCount?: unknown;
  financialCoverage?: unknown;
};

type DataStatusPayload = {
  items?: DataStatusItem[];
};

type BacktestSummary = {
  testedContests: number;
  totalGames: number;
  averageHitsPerGame: number;
  averageFixedHitsPerContest: number;
  maxHits: number;
  prizeRate: number;
  financialCoverage: number;
  roi: number;
  netResult: number;
};

type StrategyLabPoint = {
  startContest: number;
  endContest: number;
  averageHitsPerGame: number;
  prizeRate: number;
  roi: number;
  netResult: number;
};

type StrategyLabVariant = {
  key: string;
  label: string;
  fixedCount: number;
  analysisModel?: string;
  summary: BacktestSummary;
  series: StrategyLabPoint[];
};

type StrategyLabBenchmark = {
  bestStrategyKey?: string;
  basis: RankingBasis;
  medianControl: StrategyLabVariant;
  medianDelta: number;
  strategyPercentile: number;
  status: string;
  adjustedPValue: number;
  familySize: number;
  minimumAchievableAdjustedPValue: number;
  minimumRandomSamples: number;
  observationRounds: number;
  minimumObservationRounds: number;
  distribution: {
    samples: number;
    p05: number;
    p50: number;
    p95: number;
  };
};

type RankingQuality = {
  label: string;
  quality: {
    rounds: number;
    auc: number;
    deltaFromRandom: number;
  };
};

type WalkForwardResult = {
  folds: unknown[];
  totalTestRounds: number;
  tunedAuc: number;
  defaultAuc: number;
  deltaVsDefault: number;
  nullBenchmark: {
    p05: number;
    p95: number;
    twoSidedPValue: number;
  };
};

type StrategyLabResult = {
  lottery: LotteryId;
  experiment: LabExperiment;
  startContest?: number;
  endContest?: number;
  gameCount: number;
  bucketSize: number;
  randomSamples: number;
  rankingBasis: RankingBasis;
  benchmark: StrategyLabBenchmark;
  variants: StrategyLabVariant[];
  rankingQuality?: RankingQuality[];
  walkForward?: WalkForwardResult;
};

type CompareRequest = {
  lottery: LotteryId;
  experiment: LabExperiment;
  gameCount: number;
  warmupContests: number;
  lookbackContests: number;
  bucketSize: number;
  randomSamples: number;
};

const lotteries: Record<LotteryId, LotteryConfig> = {
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

const metrics: Record<MetricKey, MetricConfig> = {
  averageHitsPerGame: {
    label: "Média de acertos",
    axis: (value) => value.toFixed(1).replace(".", ","),
  },
  prizeRate: {
    label: "Taxa de premiação",
    axis: (value) => `${Math.round(value * 100)}%`,
  },
  roi: {
    label: "ROI",
    axis: (value) => `${Math.round(value * 100)}%`,
  },
  netResult: {
    label: "Resultado líquido",
    axis: (value) => compactCurrency(value),
  },
};

function requiredElement<T extends Element>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Elemento obrigatório ausente: ${selector}`);
  return element;
}

function requiredPayload<T>(payload: T | null, context: string): T {
  if (payload === null) throw new Error(`Resposta vazia ao ${context}.`);
  return payload;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erro desconhecido";
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isLotteryId(value: string | null): value is LotteryId {
  return value !== null && Object.hasOwn(lotteries, value);
}

function isLabExperiment(value: string): value is LabExperiment {
  return value === "fixed-core" || value === "score-model" || value === "external-rules";
}

function isMetricKey(value: string): value is MetricKey {
  return Object.hasOwn(metrics, value);
}

const lotterySelect = requiredElement<HTMLSelectElement>("#lab-lottery");
const form = requiredElement<HTMLFormElement>("#lab-form");
const formGrid = requiredElement<HTMLElement>(".lab-form-grid", form);
const experimentField = document.createElement("div");
experimentField.className = "field lab-experiment-field";
experimentField.innerHTML = `
  <label for="lab-experiment">Experimento</label>
  <select id="lab-experiment">
    <option value="fixed-core">Núcleo fixo</option>
    <option value="score-model">Pontuação v1 × v2 × sem pontuação</option>
    <option value="external-rules">Regras externas (Mega-Sena)</option>
  </select>`;
formGrid.prepend(experimentField);

const experimentSelect = requiredElement<HTMLSelectElement>("#lab-experiment", experimentField);
const gamesInput = requiredElement<HTMLInputElement>("#lab-games");
const lookbackInput = requiredElement<HTMLSelectElement>("#lab-lookback");
const bucketInput = requiredElement<HTMLSelectElement>("#lab-bucket");
const warmupInput = requiredElement<HTMLInputElement>("#lab-warmup");
const randomSamplesInput = requiredElement<HTMLSelectElement>("#lab-random-samples");
const runButton = requiredElement<HTMLButtonElement>("#lab-run");
const title = requiredElement<HTMLElement>("#lab-title");
const description = requiredElement<HTMLElement>("#lab-description");
const historyStatus = requiredElement<HTMLElement>("#lab-history-status");
const apiStatus = requiredElement<HTMLElement>("#lab-api-status");
const apiStatusCopy = requiredElement<HTMLElement>("span:last-child", apiStatus);
const message = requiredElement<HTMLElement>("#lab-message");
const resultsRoot = requiredElement<HTMLElement>("#lab-results");
const rankingRoot = requiredElement<HTMLElement>("#lab-ranking");
const basis = requiredElement<HTMLElement>("#lab-basis");
const periodCopy = requiredElement<HTMLElement>("#lab-period-copy");
const tableBody = requiredElement<HTMLTableSectionElement>("#lab-table-body");
const chartRoot = requiredElement<HTMLElement>("#lab-chart");
const metricSelect = requiredElement<HTMLSelectElement>("#lab-metric");

let currentResult: StrategyLabResult | undefined;
let dataStatus: DataStatusPayload | undefined;

function formatPercentagePoints(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const points = value * 100;
  return `${points > 0 ? "+" : ""}${points.toFixed(1).replace(".", ",")} p.p.`;
}

function compactCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toFixed(1).replace(".", ",")} mil`;
  return `${sign}R$ ${abs.toFixed(0)}`;
}

function formatAuc(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(3).replace(".", ",")
    : "—";
}

function setMessage(kind: MessageKind, heading: string, copy: string): void {
  message.className = `lab-message panel${kind ? ` is-${kind}` : ""}`;
  const strong = document.createElement("strong");
  strong.textContent = heading;
  const paragraph = document.createElement("p");
  paragraph.textContent = copy;
  message.replaceChildren(strong, paragraph);
}

function selectedLottery(): LotteryId {
  return isLotteryId(lotterySelect.value) ? lotterySelect.value : "mega-sena";
}

function selectedExperiment(): LabExperiment {
  return isLabExperiment(experimentSelect.value) ? experimentSelect.value : "fixed-core";
}

function selectedMetric(): MetricKey {
  return isMetricKey(metricSelect.value) ? metricSelect.value : "prizeRate";
}

function minimumPracticalRandomSamples(experiment: LabExperiment): number {
  return experiment === "external-rules" ? 250 : 100;
}

function ensureInferenceResolution(experiment: LabExperiment): void {
  const minimum = minimumPracticalRandomSamples(experiment);
  if (Number(randomSamplesInput.value) < minimum) randomSamplesInput.value = String(minimum);
}

function updateLotteryCopy(resetGames = false): void {
  const lottery = selectedLottery();
  const config = lotteries[lottery];
  const externalOption = experimentSelect.querySelector<HTMLOptionElement>('option[value="external-rules"]');
  if (externalOption) externalOption.disabled = lottery !== "mega-sena";
  if (lottery !== "mega-sena" && experimentSelect.value === "external-rules") {
    experimentSelect.value = "fixed-core";
  }

  const experiment = selectedExperiment();
  ensureInferenceResolution(experiment);
  if (experiment === "score-model") {
    title.textContent = `${config.label}: Pontuação v1 × Pontuação v2 × sem pontuação`;
    description.textContent =
      "Isola o valor da classificação, mede AUC fora da amostra e faz validação progressiva sem olhar concursos futuros.";
  } else if (experiment === "external-rules") {
    title.textContent = "Mega-Sena: validação de regras externas";
    description.textContent =
      "Testa regras como hipóteses separadas e corrige a evidência pela quantidade de variantes comparadas. O modo usa pelo menos 250 controles para ter resolução inferencial suficiente.";
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

async function checkHealth(): Promise<void> {
  try {
    const response = await fetch("/health/ready");
    if (!response.ok) throw new Error("Health check failed");
    apiStatus.className = "status-row is-ok";
    apiStatusCopy.textContent = "API e banco online";
  } catch {
    apiStatus.className = "status-row is-error";
    apiStatusCopy.textContent = "API indisponível";
  }
}

async function loadDataStatus(): Promise<void> {
  try {
    dataStatus = (await api<DataStatusPayload>("/data/status")) ?? undefined;
  } catch {
    dataStatus = undefined;
  }
  renderHistoryStatus();
}

function renderHistoryStatus(): void {
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

  const contestCount = finiteNumber(item.contestCount);
  const missingContestCount = finiteNumber(item.missingContestCount);
  const complete = missingContestCount === 0 && (contestCount ?? 0) >= 30;
  historyStatus.className = `lab-history-status ${complete ? "is-ok" : "is-warning"}`;
  const strong = document.createElement("strong");
  strong.textContent = `${contestCount === undefined ? "—" : contestCount.toLocaleString("pt-BR")} concursos`;
  const detail = document.createTextNode(
    `${missingContestCount === undefined ? "—" : missingContestCount} lacuna(s) · ${formatPercent(item.financialCoverage)} com rateio`,
  );
  historyStatus.replaceChildren(strong, document.createElement("br"), detail);
}

function rankingPrimary(variant: StrategyLabVariant, rankingBasis: RankingBasis) {
  if (rankingBasis === "roi") {
    return { label: "ROI", value: formatPercent(variant.summary.roi), raw: variant.summary.roi };
  }
  return {
    label: "Taxa de premiação",
    value: formatPercent(variant.summary.prizeRate),
    raw: variant.summary.prizeRate,
  };
}

function variantBadge(result: StrategyLabResult, variant: StrategyLabVariant, index: number): string {
  if (index === 0) return "melhor no período";
  if (result.experiment === "score-model") return variant.analysisModel || "modelo";
  if (result.experiment === "external-rules") return "regra experimental";
  return `${variant.fixedCount} fixas`;
}

function statusCopy(benchmark: StrategyLabBenchmark) {
  if (benchmark.status === "beats-random") {
    return {
      label: "Evidência acima do acaso",
      tone: "positive",
      copy: "A cauda superior permanece significativa após corrigir o número de variantes testadas.",
    } as const;
  }
  if (benchmark.status === "insufficient-resolution") {
    return {
      label: "Resolução insuficiente",
      tone: "warning",
      copy: `Com ${benchmark.distribution.samples} controles, o menor p ajustado possível é ${formatPercent(benchmark.minimumAchievableAdjustedPValue)}. São necessários pelo menos ${benchmark.minimumRandomSamples} controles para tornar 5% matematicamente atingível.`,
    } as const;
  }
  if (benchmark.status === "insufficient-sample") {
    return {
      label: "Amostra histórica pequena",
      tone: "warning",
      copy: `O recorte possui ${benchmark.observationRounds} concursos elegíveis; o mínimo inferencial é ${benchmark.minimumObservationRounds}. O resultado permanece exploratório.`,
    } as const;
  }
  if (benchmark.status === "inconclusive") {
    return {
      label: "Inconclusivo",
      tone: "warning",
      copy: "Há sinal exploratório, mas ele não passa o limiar ajustado de evidência.",
    } as const;
  }
  if (benchmark.status === "underperforms-random") {
    return {
      label: "Evidência abaixo do acaso",
      tone: "negative",
      copy: "A cauda inferior permanece significativa após a correção por múltiplas comparações.",
    } as const;
  }
  return {
    label: "Sem evidência",
    tone: "neutral",
    copy: "Com resolução e amostra suficientes, o resultado está compatível com o comportamento dos controles aleatórios neste recorte.",
  } as const;
}

function renderPredictiveEvidence(result: StrategyLabResult): string {
  if (!result.rankingQuality?.length) return "";

  const qualityCards = result.rankingQuality
    .map((item) => {
      const delta = item.quality.deltaFromRandom;
      const tone = delta > 0.01 ? "positive" : delta < -0.01 ? "negative" : "neutral";
      return `<div class="lab-evidence-card is-${tone}">
        <span>${escapeHtml(item.label)}</span>
        <strong>AUC ${formatAuc(item.quality.auc)}</strong>
        <small>${formatPercentagePoints(delta)} vs 0,500 · ${escapeHtml(item.quality.rounds)} concursos</small>
      </div>`;
    })
    .join("");

  const walk = result.walkForward;
  const walkMarkup = walk
    ? `<div class="lab-walk-forward">
      <div>
        <span class="lab-eyebrow">Otimização por validação progressiva</span>
        <strong>${formatAuc(walk.tunedAuc)} AUC otimizado vs ${formatAuc(walk.defaultAuc)} padrão</strong>
        <p>${escapeHtml(walk.folds.length)} blocos · ${escapeHtml(walk.totalTestRounds)} concursos fora da amostra. Os pesos são escolhidos no passado e congelados no bloco seguinte.</p>
      </div>
      <div class="lab-null-box">
        <span>Ganho observado</span>
        <strong>${formatPercentagePoints(walk.deltaVsDefault)}</strong>
        <small>Referência nula P05 ${formatPercentagePoints(walk.nullBenchmark.p05)} · P95 ${formatPercentagePoints(walk.nullBenchmark.p95)} · p bilateral ${formatPercent(walk.nullBenchmark.twoSidedPValue)}</small>
      </div>
    </div>`
    : "";

  return `<section class="panel lab-predictive-evidence">
    <div class="lab-evidence-head"><div>
      <span class="lab-eyebrow">Qualidade preditiva</span>
      <strong>A classificação colocou os números sorteados acima dos não sorteados?</strong>
      <p>AUC 0,500 equivale a ordenação sem informação. Concursos com lacuna no predecessor são excluídos da validação.</p>
    </div></div>
    <div class="lab-evidence-grid">${qualityCards}</div>
    ${walkMarkup}
  </section>`;
}

function renderBenchmark(result: StrategyLabResult): string {
  const benchmark = result.benchmark;
  const bestStrategy = result.variants.find((variant) => variant.key === benchmark.bestStrategyKey);
  if (!bestStrategy) return "";

  const status = statusCopy(benchmark);
  const metricLabel = benchmark.basis === "roi" ? "ROI" : "taxa de premiação";
  return `<article class="panel lab-benchmark-card is-${status.tone}">
    <div class="lab-benchmark-main">
      <span class="lab-eyebrow">Referência · ${escapeHtml(benchmark.distribution.samples)} controles · ${escapeHtml(benchmark.familySize)} variante(s) · ${escapeHtml(benchmark.observationRounds)} concursos elegíveis</span>
      <strong>${escapeHtml(bestStrategy.label)} · ${status.label}</strong>
      <p>${escapeHtml(status.copy)} Percentil de posição média ${formatPercent(benchmark.strategyPercentile)}; diferença para a mediana da distribuição: ${formatPercentagePoints(benchmark.medianDelta)} em ${metricLabel}. p ajustado: ${formatPercent(benchmark.adjustedPValue)}.</p>
    </div>
    <div class="lab-distribution">
      <div><span>P05</span><strong>${formatPercent(benchmark.distribution.p05)}</strong></div>
      <div><span>P50</span><strong>${formatPercent(benchmark.distribution.p50)}</strong></div>
      <div><span>P95</span><strong>${formatPercent(benchmark.distribution.p95)}</strong></div>
      <div class="is-strategy"><span>Estratégia</span><strong>${formatPercent(rankingPrimary(bestStrategy, benchmark.basis).raw)}</strong></div>
    </div>
  </article>`;
}

function renderRanking(result: StrategyLabResult): void {
  const cards = result.variants
    .map((variant, index) => {
      const primary = rankingPrimary(variant, result.rankingBasis);
      const tone = primary.raw >= 0 ? "positive" : "negative";
      const winner = index === 0;
      return `<article class="panel lab-strategy-card ${winner ? "is-winner" : ""}">
        <div class="lab-rank-row">
          <span class="lab-rank-number">${index + 1}</span>
          <span class="badge ${winner ? "positive" : ""}">${escapeHtml(variantBadge(result, variant, index))}</span>
        </div>
        <h3>${escapeHtml(variant.label)}</h3>
        <p>${escapeHtml(variant.summary.testedContests)} concursos · ${escapeHtml(variant.summary.totalGames)} jogos simulados</p>
        <div class="lab-primary-metric"><span>${primary.label}</span><strong class="${tone}">${primary.value}</strong></div>
        <div class="lab-mini-metrics">
          <div class="lab-mini-metric"><span>Acertos médios</span><strong>${variant.summary.averageHitsPerGame.toFixed(2).replace(".", ",")}</strong></div>
          <div class="lab-mini-metric"><span>Melhor</span><strong>${escapeHtml(variant.summary.maxHits)}</strong></div>
          <div class="lab-mini-metric"><span>Cobertura</span><strong>${formatPercent(variant.summary.financialCoverage)}</strong></div>
        </div>
      </article>`;
    })
    .join("");

  rankingRoot.innerHTML = `${renderBenchmark(result)}${cards}${renderPredictiveEvidence(result)}`;
}

function renderTable(result: StrategyLabResult): void {
  const control = result.benchmark.medianControl;
  const rows = [...result.variants, control];
  tableBody.innerHTML = rows
    .map((variant, index) => {
      const isControl = variant.key === control.key;
      const winnerClass = index === 0 && !isControl ? "lab-winner-cell" : "";
      const roiClass = variant.summary.roi >= 0 ? "positive" : "negative";
      const fixedAverage =
        isControl || result.experiment === "external-rules"
          ? "—"
          : variant.summary.averageFixedHitsPerContest.toFixed(2).replace(".", ",");
      return `<tr class="${isControl ? "lab-control-row" : ""}">
        <td class="${winnerClass}"><span class="lab-table-rank">${isControl ? "C" : index + 1}</span><strong>${escapeHtml(variant.label)}</strong>${isControl ? ' <span class="badge">amostra próxima da mediana</span>' : ""}</td>
        <td>${variant.summary.averageHitsPerGame.toFixed(2).replace(".", ",")}</td>
        <td>${fixedAverage}</td>
        <td><strong>${escapeHtml(variant.summary.maxHits)}</strong></td>
        <td>${formatPercent(variant.summary.prizeRate)}</td>
        <td>${formatPercent(variant.summary.financialCoverage)}</td>
        <td><strong class="${roiClass}">${formatPercent(variant.summary.roi)}</strong></td>
        <td>${formatCurrency(variant.summary.netResult)}</td>
      </tr>`;
    })
    .join("");
}

function chartValue(point: StrategyLabPoint | undefined, metric: MetricKey): number {
  const value = point?.[metric];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function renderChart(): void {
  if (!currentResult) return;
  const metric = selectedMetric();
  const metricConfig = metrics[metric];
  const strategyVariants =
    currentResult.experiment === "external-rules"
      ? currentResult.variants.slice(0, 3)
      : currentResult.variants;
  const control = currentResult.benchmark.medianControl;
  const variants = [...strategyVariants, control];
  const allValues = variants.flatMap((variant) =>
    variant.series.map((point) => chartValue(point, metric)),
  );
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
  const xFor = (index: number) =>
    left + (maxPoints <= 1 ? plotWidth / 2 : (index / (maxPoints - 1)) * plotWidth);
  const yFor = (value: number) => top + ((max - value) / (max - min)) * plotHeight;

  const grid = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const value = max - ratio * (max - min);
    const y = top + ratio * plotHeight;
    return `<line class="lab-chart-grid" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"/><text class="lab-chart-axis" x="${left - 10}" y="${y + 3}" text-anchor="end">${escapeHtml(metricConfig.axis(value))}</text>`;
  }).join("");

  const zeroLine =
    min < 0 && max > 0
      ? `<line class="lab-chart-zero" x1="${left}" y1="${yFor(0)}" x2="${width - right}" y2="${yFor(0)}"/>`
      : "";

  const lines = variants
    .map((variant, variantIndex) => {
      const isControl = variant.key === control.key;
      const points = variant.series
        .map((point, index) => `${xFor(index)},${yFor(chartValue(point, metric))}`)
        .join(" ");
      const dots = variant.series
        .map(
          (point, index) =>
            `<circle class="lab-point-${variantIndex}" cx="${xFor(index)}" cy="${yFor(chartValue(point, metric))}" r="3"/>`,
        )
        .join("");
      return `<polyline class="lab-series lab-series-${variantIndex}${isControl ? " lab-series-control" : ""}" points="${points}"/>${dots}`;
    })
    .join("");

  const referenceSeries = variants[0]?.series ?? [];
  const labelIndexes = [...new Set([0, Math.floor((maxPoints - 1) / 2), maxPoints - 1])].filter(
    (index) => index >= 0,
  );
  const xLabels = labelIndexes
    .map((index) => {
      const point = referenceSeries[index];
      return point
        ? `<text class="lab-chart-axis" x="${xFor(index)}" y="${height - 14}" text-anchor="middle">#${escapeHtml(point.startContest)}–${escapeHtml(point.endContest)}</text>`
        : "";
    })
    .join("");
  const legend = variants
    .map(
      (variant, index) =>
        `<span class="lab-legend-item"><span class="lab-legend-dot series-${index}"></span>${escapeHtml(variant.label)}${variant.key === control.key ? " · referência" : ""}</span>`,
    )
    .join("");

  chartRoot.innerHTML = `
    <div class="lab-chart-top-note">Linha tracejada: amostra aleatória próxima da mediana da distribuição. O P50 real é calculado sobre a distribuição inteira.</div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(metricConfig.label)} por bloco de concursos">${grid}${zeroLine}${lines}${xLabels}</svg>
    <div class="lab-chart-legend">${legend}</div>`;
}

function renderResult(result: StrategyLabResult): void {
  currentResult = result;
  resultsRoot.hidden = false;
  message.hidden = true;
  basis.textContent =
    result.rankingBasis === "roi" ? "Classificação por ROI" : "Classificação por taxa de premiação";
  const experimentCopy =
    result.experiment === "external-rules"
      ? "regras externas"
      : result.experiment === "score-model"
        ? "modelos de pontuação"
        : "núcleo fixo";
  periodCopy.textContent = `Concursos #${result.startContest ?? "—"} a #${result.endContest ?? "—"} · ${result.gameCount} jogo(s) por concurso · ${experimentCopy} · ${result.randomSamples} controles aleatórios · blocos de ${result.bucketSize}`;
  metricSelect.value = result.rankingBasis === "roi" ? "roi" : "prizeRate";
  renderRanking(result);
  renderTable(result);
  renderChart();
}

function compareRequest(): CompareRequest {
  return {
    lottery: selectedLottery(),
    experiment: selectedExperiment(),
    gameCount: Number(gamesInput.value),
    warmupContests: Number(warmupInput.value),
    lookbackContests: Number(lookbackInput.value),
    bucketSize: Number(bucketInput.value),
    randomSamples: Number(randomSamplesInput.value),
  };
}

function comparisonErrorHeading(error: unknown): string {
  const code = error instanceof ApiError ? error.code : "";
  if (code === "INSUFFICIENT_HISTORY") return "Histórico insuficiente";
  if (code === "EMPTY_PERIOD") return "Período sem concursos elegíveis";
  if (code === "ANALYSIS_TOO_LARGE") return "Análise grande demais";
  if (code === "ANALYSIS_TIMEOUT") return "Limite de execução atingido";
  return "Comparação não concluída";
}

async function runComparison(event?: SubmitEvent): Promise<void> {
  event?.preventDefault();
  const requestedLottery = selectedLottery();
  const requestedExperiment = selectedExperiment();
  runButton.disabled = true;
  runButton.textContent = "Comparando...";
  message.hidden = false;
  resultsRoot.hidden = true;
  setMessage(
    "running",
    "Executando testes históricos",
    "Estratégias, AUC e controles aleatórios usam somente a informação disponível antes de cada concurso elegível.",
  );

  try {
    const payload = requiredPayload(
      await api<StrategyLabResult>("/lab/compare", {
        method: "POST",
        body: JSON.stringify(compareRequest()),
      }),
      "executar comparação",
    );
    if (selectedLottery() !== requestedLottery || selectedExperiment() !== requestedExperiment) return;
    renderResult(payload);
  } catch (error) {
    if (selectedLottery() !== requestedLottery || selectedExperiment() !== requestedExperiment) return;
    resultsRoot.hidden = true;
    message.hidden = false;
    setMessage("error", comparisonErrorHeading(error), errorMessage(error));
  } finally {
    runButton.disabled = false;
    runButton.textContent = "Executar comparação";
  }
}

lotterySelect.addEventListener("change", () => updateLotteryCopy(true));
experimentSelect.addEventListener("change", () => updateLotteryCopy(false));
form.addEventListener("submit", (event) => {
  void runComparison(event);
});
metricSelect.addEventListener("change", renderChart);

const savedLottery = localStorage.getItem("loto-lab:lottery");
if (isLotteryId(savedLottery)) lotterySelect.value = savedLottery;
gamesInput.value = String(lotteries[selectedLottery()].defaultGames);
updateLotteryCopy(false);
void checkHealth();
void loadDataStatus();
