import { api } from "../core/api.js";
import { escapeHtml } from "../shared/escaping.js";
import { formatDateTime, formatPercent } from "../shared/formatters.js";
import { toast } from "../shared/toast.js";

type LotteryId = "mega-sena" | "lotofacil" | "dia-de-sorte";
type JobKind = "backtest" | "strategy-lab";

type StrategyConfig = {
  gameCount?: number;
  warmupContests?: number;
  fixedCount?: number;
  experiment?: string;
  lookbackContests?: number;
  bucketSize?: number;
  randomSamples?: number;
};

type StrategySummary = {
  latestVersionId: number;
  name: string;
  version: number;
  config?: StrategyConfig;
};

type HistoricalStrategyVersion = {
  id: number;
  version: number;
  config?: StrategyConfig;
  strategy?: { lottery?: string; name?: string };
};

type StrategyListResponse = { items?: StrategySummary[] };
type JobInput = {
  strategyVersionId?: number;
  gameCount?: number;
  warmupContests?: number;
  randomSamples?: number;
};
type JobBenchmark = {
  status?: string;
  adjustedPValue?: number;
  distribution?: { samples?: number };
};
type JobResult = {
  id?: number;
  roundCount?: number;
  rankingBasis?: string;
  randomSamples?: number;
  winner?: string;
  benchmark?: JobBenchmark;
  variants?: Array<{ key?: string; label?: string }>;
  summary?: { roi?: number | null; financialCoverage?: number | null };
};
type AnalysisJob = {
  id: number;
  kind: JobKind;
  lottery: LotteryId;
  status: string;
  input?: JobInput;
  result?: JobResult;
  error?: { code?: string; message?: string };
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
};
type JobListResponse = { items?: AnalysisJob[] };
type CreateJobBody = {
  kind: string;
  lottery: string;
  gameCount: number;
  warmupContests: number;
  strategyVersionId?: number;
  startContest?: number;
  endContest?: number;
  fixedCount?: number;
  experiment?: string;
  lookbackContests?: number;
  bucketSize?: number;
  randomSamples?: number;
};

const labels: Record<LotteryId, string> = {
  "mega-sena": "Mega-Sena",
  lotofacil: "Lotofácil",
  "dia-de-sorte": "Dia de Sorte",
};
const statusLabels: Record<string, string> = {
  queued: "na fila",
  running: "em execução",
  succeeded: "concluída",
  completed: "concluída",
  failed: "falhou",
  cancelled: "cancelada",
  abandoned: "abandonada",
};
const rankingLabels: Record<string, string> = {
  prizeRate: "taxa de premiação",
  averageHitsPerGame: "média de acertos",
  roi: "ROI",
};
const evidenceLabels: Record<string, string> = {
  "beats-random": "evidência favorável",
  inconclusive: "inconclusiva",
  "no-evidence": "sem evidência",
  "underperforms-random": "evidência desfavorável",
  "insufficient-resolution": "resolução insuficiente",
  "insufficient-sample": "amostra insuficiente",
};
const knownStatusClasses = new Set([
  "queued",
  "running",
  "succeeded",
  "completed",
  "failed",
  "cancelled",
  "abandoned",
]);

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
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

function isLotteryId(value: string | null): value is LotteryId {
  return value !== null && Object.hasOwn(labels, value);
}

function statusClass(status: string): string {
  return knownStatusClasses.has(status) ? status : "unknown";
}

const form = requiredElement<HTMLFormElement>("#job-form");
const kind = requiredElement<HTMLSelectElement>("#job-kind");
const lottery = requiredElement<HTMLSelectElement>("#job-lottery");
const strategySelect = requiredElement<HTMLSelectElement>("#job-strategy");
const games = requiredElement<HTMLInputElement>("#job-games");
const warmup = requiredElement<HTMLInputElement>("#job-warmup");
const fixed = requiredElement<HTMLSelectElement>("#job-fixed");
const fixedField = requiredElement<HTMLElement>("#job-fixed-field");
const start = requiredElement<HTMLInputElement>("#job-start");
const end = requiredElement<HTMLInputElement>("#job-end");
const experiment = requiredElement<HTMLSelectElement>("#job-experiment");
const lookback = requiredElement<HTMLInputElement>("#job-lookback");
const bucket = requiredElement<HTMLInputElement>("#job-bucket");
const randomSamples = requiredElement<HTMLSelectElement>("#job-random-samples");
const labFields = Array.from(document.querySelectorAll<HTMLElement>("[data-lab-field]"));
const refreshButton = requiredElement<HTMLButtonElement>("#jobs-refresh");
const listRoot = requiredElement<HTMLElement>("#jobs-list");
const countRoot = requiredElement<HTMLElement>("#jobs-count");
const submitButton = requiredElement<HTMLButtonElement>('#job-form button[type="submit"]');

let strategies: StrategySummary[] = [];
let selectedHistoricalVersion: HistoricalStrategyVersion | undefined;
let jobs: AnalysisJob[] = [];
let pollTimer: number | undefined;
let loadToken = 0;
let strategyLoadToken = 0;

function clearPoll(): void {
  if (pollTimer !== undefined) window.clearTimeout(pollTimer);
  pollTimer = undefined;
}

function syncFields(): void {
  const isLab = kind.value === "strategy-lab";
  labFields.forEach((field) => {
    field.hidden = !isLab;
  });
  fixedField.hidden = lottery.value !== "lotofacil";
  Array.from(experiment.options).forEach((option) => {
    if (option.value === "external-rules") option.disabled = lottery.value !== "mega-sena";
  });
  if (lottery.value !== "mega-sena" && experiment.value === "external-rules") {
    experiment.value = "fixed-core";
  }
  if (experiment.value === "external-rules" && Number(randomSamples.value) < 250) {
    randomSamples.value = "250";
  }
}

function applyConfig(config: StrategyConfig = {}): void {
  games.value = String(config.gameCount ?? games.value);
  warmup.value = String(config.warmupContests ?? warmup.value);
  fixed.value = String(config.fixedCount ?? fixed.value);
  experiment.value = config.experiment ?? experiment.value;
  lookback.value = String(config.lookbackContests ?? lookback.value);
  bucket.value = String(config.bucketSize ?? bucket.value);
  randomSamples.value = String(config.randomSamples ?? randomSamples.value);
  syncFields();
}

function renderStrategyOptions(items: StrategySummary[]): string {
  return (
    '<option value="">Configuração manual</option>' +
    items
      .map(
        (strategy) =>
          `<option value="${escapeHtml(strategy.latestVersionId)}">${escapeHtml(strategy.name)} · v${escapeHtml(strategy.version)} (#${escapeHtml(strategy.latestVersionId)})</option>`,
      )
      .join("")
  );
}

async function loadHistoricalVersion(
  preferred: string,
  requestedLottery: string,
  token: number,
): Promise<void> {
  const historical = requiredPayload(
    await api<HistoricalStrategyVersion>(`/strategy-versions/${encodeURIComponent(preferred)}`),
    "carregar versão histórica",
  );
  if (token !== strategyLoadToken || lottery.value !== requestedLottery) return;
  if (historical.strategy?.lottery !== requestedLottery) return;

  selectedHistoricalVersion = historical;
  const option = document.createElement("option");
  option.value = String(historical.id);
  option.textContent = `${historical.strategy.name ?? "Estratégia"} · v${historical.version} (#${historical.id})`;
  strategySelect.append(option);
  strategySelect.value = option.value;
}

async function selectPreferredVersion(
  preferredVersionId: string,
  requestedLottery: string,
  token: number,
): Promise<void> {
  const preferred = String(preferredVersionId);
  if (Array.from(strategySelect.options).some((option) => option.value === preferred)) {
    strategySelect.value = preferred;
    return;
  }
  await loadHistoricalVersion(preferred, requestedLottery, token);
}

function applySelectedStrategyConfig(): void {
  const selectedId = Number(strategySelect.value);
  const latest = strategies.find((item) => item.latestVersionId === selectedId);
  if (latest) applyConfig(latest.config);
  else if (selectedHistoricalVersion?.id === selectedId) {
    applyConfig(selectedHistoricalVersion.config);
  }
}

async function loadStrategies(preferredVersionId?: string | null): Promise<void> {
  const requestedLottery = lottery.value;
  const token = ++strategyLoadToken;
  selectedHistoricalVersion = undefined;
  try {
    const data = requiredPayload(
      await api<StrategyListResponse>(`/strategies?lottery=${encodeURIComponent(requestedLottery)}`),
      "carregar estratégias",
    );
    if (token !== strategyLoadToken || lottery.value !== requestedLottery) return;
    strategies = data.items ?? [];
    strategySelect.innerHTML = renderStrategyOptions(strategies);
    if (preferredVersionId) {
      await selectPreferredVersion(preferredVersionId, requestedLottery, token);
      if (token !== strategyLoadToken || lottery.value !== requestedLottery) return;
    }
    applySelectedStrategyConfig();
  } catch (error) {
    if (token !== strategyLoadToken || lottery.value !== requestedLottery) return;
    strategies = [];
    selectedHistoricalVersion = undefined;
    strategySelect.innerHTML = '<option value="">Estratégias indisponíveis</option>';
    toast(errorMessage(error), "error");
  }
}

function strategyResult(job: AnalysisJob): string {
  const benchmark = job.result?.benchmark ?? {};
  const status = evidenceLabels[benchmark.status ?? ""] ?? benchmark.status ?? "não classificada";
  const best = job.result?.variants?.find((variant) => variant.key === job.result?.winner);
  const bestLabel = best?.label ?? job.result?.winner ?? "empate/indefinido";
  const basis = job.result?.rankingBasis ?? "";
  const ranking = rankingLabels[basis] ?? (basis || "—");
  const adjustedP =
    typeof benchmark.adjustedPValue === "number"
      ? benchmark.adjustedPValue.toFixed(4).replace(".", ",")
      : "—";
  const samples =
    benchmark.distribution?.samples ?? job.result?.randomSamples ?? job.input?.randomSamples ?? "—";
  return `<div class="job-result"><strong>Laboratório concluído</strong><span>Melhor no período: ${escapeHtml(bestLabel)} · evidência ${escapeHtml(status)} · p ajustado ${escapeHtml(adjustedP)} · ${escapeHtml(samples)} controles · classificação por ${escapeHtml(ranking)}</span></div>`;
}

function jobResult(job: AnalysisJob): string {
  if (job.status === "running") {
    return '<div class="job-running"><span class="spinner"></span>Processando em processo dedicado</div>';
  }
  if (job.status === "queued") {
    return '<div class="job-result">Aguardando disponibilidade para análises.</div>';
  }
  if (job.status === "cancelled") {
    return '<div class="job-result job-error">Execução cancelada.</div>';
  }
  if (job.status === "failed") {
    return `<div class="job-result job-error"><strong>${escapeHtml(job.error?.code ?? "ERRO")}</strong>${escapeHtml(job.error?.message ?? "Falha na execução")}</div>`;
  }
  if (!job.result) return "";
  if (job.kind !== "backtest") return strategyResult(job);

  const summary = job.result.summary ?? {};
  const title = job.result.id ? `#${escapeHtml(job.result.id)}` : "concluído";
  return `<div class="job-result"><strong>Teste histórico ${title}</strong><span>${escapeHtml(job.result.roundCount ?? "—")} concursos · ROI ${escapeHtml(formatPercent(summary.roi))} · cobertura ${escapeHtml(formatPercent(summary.financialCoverage))}</span></div>`;
}

function renderJobMeta(job: AnalysisJob): string {
  const strategyVersionId = job.input?.strategyVersionId;
  return `
    ${strategyVersionId ? `<span>estratégia #${escapeHtml(strategyVersionId)}</span>` : ""}
    <span>${escapeHtml(job.input?.gameCount ?? "—")} jogos</span>
    <span>aquecimento ${escapeHtml(job.input?.warmupContests ?? "—")}</span>
    ${job.kind === "strategy-lab" ? `<span>${escapeHtml(job.input?.randomSamples ?? "—")} controles</span>` : ""}
    ${job.startedAt ? `<span>início ${escapeHtml(formatDateTime(job.startedAt))}</span>` : ""}
    ${job.finishedAt ? `<span>fim ${escapeHtml(formatDateTime(job.finishedAt))}</span>` : ""}`;
}

function renderJobCard(job: AnalysisJob): string {
  const id = escapeHtml(job.id);
  const canCancel = job.status === "queued" || job.status === "running";
  const kindLabel = job.kind === "backtest" ? "Teste histórico" : "Laboratório";
  const lotteryLabel = labels[job.lottery] ?? job.lottery;
  const statusLabel = statusLabels[job.status] ?? job.status;
  return `
    <article class="panel experiment-card" data-job-id="${id}">
      <div class="experiment-card-head">
        <div><h3>#${id} · ${kindLabel}</h3><p>${escapeHtml(lotteryLabel)} · criada ${escapeHtml(formatDateTime(job.createdAt))}</p></div>
        <span class="status-pill ${statusClass(job.status)}">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="experiment-meta">${renderJobMeta(job)}</div>
      ${jobResult(job)}
      ${canCancel ? `<div class="experiment-card-actions"><button class="button compact danger" type="button" data-cancel-job="${id}">Cancelar</button></div>` : ""}
    </article>`;
}

function renderJobs(): void {
  const pending = jobs.filter((job) => job.status === "queued" || job.status === "running").length;
  countRoot.textContent = `${jobs.length} execução(ões) · ${pending} pendente(s)`;
  if (!jobs.length) {
    listRoot.innerHTML =
      '<div class="panel experiment-empty">Nenhuma execução ainda para esta loteria.</div>';
    return;
  }
  listRoot.innerHTML = jobs.map(renderJobCard).join("");
}

function schedulePoll(): void {
  clearPoll();
  const pending = jobs.some((job) => job.status === "queued" || job.status === "running");
  if (!pending || document.hidden) return;
  pollTimer = window.setTimeout(() => {
    void loadJobs(false);
  }, 1800);
}

async function loadJobs(showLoading = true): Promise<void> {
  const requestedLottery = lottery.value;
  const token = ++loadToken;
  if (showLoading) {
    listRoot.innerHTML =
      '<div class="loading-state"><span class="spinner"></span><span>Carregando execuções...</span></div>';
  }
  refreshButton.disabled = true;
  try {
    const data = requiredPayload(
      await api<JobListResponse>(
        `/analysis-jobs?lottery=${encodeURIComponent(requestedLottery)}&limit=100`,
      ),
      "carregar execuções",
    );
    if (token !== loadToken || lottery.value !== requestedLottery) return;
    jobs = data.items ?? [];
    renderJobs();
    schedulePoll();
  } catch (error) {
    if (token !== loadToken || lottery.value !== requestedLottery) return;
    listRoot.innerHTML = `<div class="panel experiment-empty job-error">${escapeHtml(errorMessage(error))}</div>`;
  } finally {
    if (token === loadToken && lottery.value === requestedLottery) refreshButton.disabled = false;
  }
}

function createJobBody(): CreateJobBody {
  const body: CreateJobBody = {
    kind: kind.value,
    lottery: lottery.value,
    gameCount: Number(games.value),
    warmupContests: Number(warmup.value),
  };
  if (strategySelect.value) body.strategyVersionId = Number(strategySelect.value);
  if (start.value) body.startContest = Number(start.value);
  if (end.value) body.endContest = Number(end.value);
  if (lottery.value === "lotofacil") body.fixedCount = Number(fixed.value);
  if (kind.value === "strategy-lab") {
    body.experiment = experiment.value;
    body.lookbackContests = Number(lookback.value);
    body.bucketSize = Number(bucket.value);
    body.randomSamples = Number(randomSamples.value);
  }
  return body;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  try {
    const job = requiredPayload(
      await api<AnalysisJob>("/analysis-jobs", {
        method: "POST",
        body: JSON.stringify(createJobBody()),
      }),
      "enfileirar execução",
    );
    toast(`Execução #${job.id} entrou na fila.`);
    await loadJobs(false);
  } catch (error) {
    toast(errorMessage(error), "error");
  } finally {
    submitButton.disabled = false;
  }
});

listRoot.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>("[data-cancel-job]");
  if (!button) return;
  const jobId = Number(button.dataset.cancelJob);
  if (!Number.isSafeInteger(jobId) || jobId <= 0) {
    toast("Identificador de execução inválido.", "error");
    return;
  }

  button.disabled = true;
  try {
    const job = requiredPayload(
      await api<AnalysisJob>(`/analysis-jobs/${encodeURIComponent(String(jobId))}/cancel`, {
        method: "POST",
      }),
      "cancelar execução",
    );
    toast(`Execução #${job.id} cancelada/solicitada.`);
    await loadJobs(false);
  } catch (error) {
    toast(errorMessage(error), "error");
    if (button.isConnected) button.disabled = false;
  }
});

strategySelect.addEventListener("change", applySelectedStrategyConfig);
kind.addEventListener("change", syncFields);
experiment.addEventListener("change", syncFields);
lottery.addEventListener("change", async () => {
  const requestedLottery = lottery.value;
  localStorage.setItem("loto-lab:lottery", requestedLottery);
  syncFields();
  await Promise.all([loadStrategies(), loadJobs()]);
  if (lottery.value !== requestedLottery) return;
});
refreshButton.addEventListener("click", () => {
  void loadJobs();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void loadJobs(false);
  else clearPoll();
});

const params = new URLSearchParams(location.search);
const requestedLottery = params.get("lottery");
const storedLottery = localStorage.getItem("loto-lab:lottery");
lottery.value = isLotteryId(requestedLottery)
  ? requestedLottery
  : isLotteryId(storedLottery)
    ? storedLottery
    : "mega-sena";
syncFields();
await loadStrategies(params.get("strategyVersionId"));
await loadJobs();
