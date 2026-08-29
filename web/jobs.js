import { api, escapeHtml, formatDateTime, formatPercent, toast } from "./runtime.js";

const LABELS = {
  "mega-sena": "Mega-Sena",
  lotofacil: "Lotofácil",
  "dia-de-sorte": "Dia de Sorte",
};

const STATUS_LABELS = {
  queued: "na fila",
  running: "em execução",
  succeeded: "concluída",
  completed: "concluída",
  failed: "falhou",
  cancelled: "cancelada",
  abandoned: "abandonada",
};

const RANKING_LABELS = {
  prizeRate: "taxa de premiação",
  averageHitsPerGame: "média de acertos",
  roi: "ROI",
};

const EVIDENCE_LABELS = {
  "beats-random": "evidência favorável",
  inconclusive: "inconclusiva",
  "no-evidence": "sem evidência",
  "underperforms-random": "evidência desfavorável",
  "insufficient-resolution": "resolução insuficiente",
  "insufficient-sample": "amostra insuficiente",
};

const form = document.querySelector("#job-form");
const kind = document.querySelector("#job-kind");
const lottery = document.querySelector("#job-lottery");
const strategySelect = document.querySelector("#job-strategy");
const games = document.querySelector("#job-games");
const warmup = document.querySelector("#job-warmup");
const fixed = document.querySelector("#job-fixed");
const fixedField = document.querySelector("#job-fixed-field");
const start = document.querySelector("#job-start");
const end = document.querySelector("#job-end");
const experiment = document.querySelector("#job-experiment");
const lookback = document.querySelector("#job-lookback");
const bucket = document.querySelector("#job-bucket");
const randomSamples = document.querySelector("#job-random-samples");
const labFields = [...document.querySelectorAll("[data-lab-field]")];
const refreshButton = document.querySelector("#jobs-refresh");
const listRoot = document.querySelector("#jobs-list");
const countRoot = document.querySelector("#jobs-count");

let strategies = [];
let selectedHistoricalVersion;
let jobs = [];
let pollTimer;
let loadToken = 0;
let strategyLoadToken = 0;

function syncFields() {
  const isLab = kind.value === "strategy-lab";
  labFields.forEach((field) => { field.hidden = !isLab; });
  fixedField.hidden = lottery.value !== "lotofacil";
  [...experiment.options].forEach((option) => {
    if (option.value === "external-rules") option.disabled = lottery.value !== "mega-sena";
  });
  if (lottery.value !== "mega-sena" && experiment.value === "external-rules") experiment.value = "fixed-core";
  if (experiment.value === "external-rules" && Number(randomSamples.value) < 250) randomSamples.value = "250";
}

function applyConfig(config = {}) {
  games.value = config.gameCount ?? games.value;
  warmup.value = config.warmupContests ?? warmup.value;
  fixed.value = config.fixedCount ?? fixed.value;
  experiment.value = config.experiment ?? experiment.value;
  lookback.value = config.lookbackContests ?? lookback.value;
  bucket.value = config.bucketSize ?? bucket.value;
  randomSamples.value = config.randomSamples ?? randomSamples.value;
  syncFields();
}

async function loadStrategies(preferredVersionId) {
  const requestedLottery = lottery.value;
  const token = ++strategyLoadToken;
  selectedHistoricalVersion = undefined;
  try {
    const data = await api(`/strategies?lottery=${encodeURIComponent(requestedLottery)}`);
    if (token !== strategyLoadToken || lottery.value !== requestedLottery) return;
    strategies = data.items || [];
    strategySelect.innerHTML = '<option value="">Configuração manual</option>' + strategies.map((strategy) =>
      `<option value="${strategy.latestVersionId}">${escapeHtml(strategy.name)} · v${strategy.version} (#${strategy.latestVersionId})</option>`,
    ).join("");

    if (preferredVersionId) {
      const preferred = String(preferredVersionId);
      if ([...strategySelect.options].some((option) => option.value === preferred)) {
        strategySelect.value = preferred;
      } else {
        const historical = await api(`/strategy-versions/${encodeURIComponent(preferred)}`);
        if (token !== strategyLoadToken || lottery.value !== requestedLottery) return;
        if (historical.strategy?.lottery === requestedLottery) {
          selectedHistoricalVersion = historical;
          const option = document.createElement("option");
          option.value = String(historical.id);
          option.textContent = `${historical.strategy.name} · v${historical.version} (#${historical.id})`;
          strategySelect.append(option);
          strategySelect.value = option.value;
        }
      }
    }

    const latest = strategies.find((item) => item.latestVersionId === Number(strategySelect.value));
    if (latest) applyConfig(latest.config);
    else if (selectedHistoricalVersion?.id === Number(strategySelect.value)) applyConfig(selectedHistoricalVersion.config);
  } catch (error) {
    if (token !== strategyLoadToken || lottery.value !== requestedLottery) return;
    strategies = [];
    selectedHistoricalVersion = undefined;
    strategySelect.innerHTML = '<option value="">Estratégias indisponíveis</option>';
    toast(error.message, "error");
  }
}

function strategyResult(job) {
  const benchmark = job.result?.benchmark || {};
  const status = EVIDENCE_LABELS[benchmark.status] || benchmark.status || "não classificada";
  const best = job.result?.variants?.find((variant) => variant.key === job.result?.winner);
  const bestLabel = best?.label || job.result?.winner || "empate/indefinido";
  const ranking = RANKING_LABELS[job.result?.rankingBasis] || job.result?.rankingBasis || "—";
  const adjustedP = typeof benchmark.adjustedPValue === "number"
    ? benchmark.adjustedPValue.toFixed(4).replace(".", ",")
    : "—";
  const samples = benchmark.distribution?.samples ?? job.result?.randomSamples ?? job.input?.randomSamples ?? "—";
  return `<div class="job-result"><strong>Laboratório concluído</strong><span>Melhor no período: ${escapeHtml(bestLabel)} · evidência ${escapeHtml(status)} · p ajustado ${escapeHtml(adjustedP)} · ${escapeHtml(samples)} controles · classificação por ${escapeHtml(ranking)}</span></div>`;
}

function jobResult(job) {
  if (job.status === "running") return '<div class="job-running"><span class="spinner"></span>Processando em processo dedicado</div>';
  if (job.status === "queued") return '<div class="job-result">Aguardando disponibilidade para análises.</div>';
  if (job.status === "cancelled") return '<div class="job-result job-error">Execução cancelada.</div>';
  if (job.status === "failed") return `<div class="job-result job-error"><strong>${escapeHtml(job.error?.code || "ERRO")}</strong>${escapeHtml(job.error?.message || "Falha na execução")}</div>`;
  if (!job.result) return "";

  if (job.kind === "backtest") {
    const summary = job.result.summary || {};
    return `<div class="job-result"><strong>Teste histórico ${job.result.id ? `#${job.result.id}` : "concluído"}</strong><span>${job.result.roundCount ?? "—"} concursos · ROI ${escapeHtml(formatPercent(summary.roi))} · cobertura ${escapeHtml(formatPercent(summary.financialCoverage))}</span></div>`;
  }

  return strategyResult(job);
}

function renderJobs() {
  const pending = jobs.filter((job) => job.status === "queued" || job.status === "running").length;
  countRoot.textContent = `${jobs.length} execução(ões) · ${pending} pendente(s)`;
  if (!jobs.length) {
    listRoot.innerHTML = '<div class="panel experiment-empty">Nenhuma execução ainda para esta loteria.</div>';
    return;
  }

  listRoot.innerHTML = jobs.map((job) => {
    const strategyVersionId = job.input?.strategyVersionId;
    const canCancel = job.status === "queued" || job.status === "running";
    return `
      <article class="panel experiment-card" data-job-id="${job.id}">
        <div class="experiment-card-head">
          <div><h3>#${job.id} · ${job.kind === "backtest" ? "Teste histórico" : "Laboratório"}</h3><p>${escapeHtml(LABELS[job.lottery])} · criada ${escapeHtml(formatDateTime(job.createdAt))}</p></div>
          <span class="status-pill ${job.status}">${escapeHtml(STATUS_LABELS[job.status] || job.status)}</span>
        </div>
        <div class="experiment-meta">
          ${strategyVersionId ? `<span>estratégia #${strategyVersionId}</span>` : ""}
          <span>${job.input?.gameCount ?? "—"} jogos</span>
          <span>aquecimento ${job.input?.warmupContests ?? "—"}</span>
          ${job.kind === "strategy-lab" ? `<span>${job.input?.randomSamples ?? "—"} controles</span>` : ""}
          ${job.startedAt ? `<span>início ${escapeHtml(formatDateTime(job.startedAt))}</span>` : ""}
          ${job.finishedAt ? `<span>fim ${escapeHtml(formatDateTime(job.finishedAt))}</span>` : ""}
        </div>
        ${jobResult(job)}
        ${canCancel ? `<div class="experiment-card-actions"><button class="button compact danger" type="button" data-cancel-job="${job.id}">Cancelar</button></div>` : ""}
      </article>`;
  }).join("");
}

function schedulePoll() {
  clearTimeout(pollTimer);
  const pending = jobs.some((job) => job.status === "queued" || job.status === "running");
  if (!pending || document.hidden) return;
  pollTimer = window.setTimeout(() => { void loadJobs(false); }, 1800);
}

async function loadJobs(showLoading = true) {
  const requestedLottery = lottery.value;
  const token = ++loadToken;
  if (showLoading) listRoot.innerHTML = '<div class="loading-state"><span class="spinner"></span><span>Carregando execuções...</span></div>';
  refreshButton.disabled = true;
  try {
    const data = await api(`/analysis-jobs?lottery=${encodeURIComponent(requestedLottery)}&limit=100`);
    if (token !== loadToken || lottery.value !== requestedLottery) return;
    jobs = data.items || [];
    renderJobs();
    schedulePoll();
  } catch (error) {
    if (token !== loadToken || lottery.value !== requestedLottery) return;
    listRoot.innerHTML = `<div class="panel experiment-empty job-error">${escapeHtml(error.message)}</div>`;
  } finally {
    if (token === loadToken && lottery.value === requestedLottery) refreshButton.disabled = false;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const body = { kind: kind.value, lottery: lottery.value, gameCount: Number(games.value), warmupContests: Number(warmup.value) };
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
    const job = await api("/analysis-jobs", { method: "POST", body: JSON.stringify(body) });
    toast(`Execução #${job.id} entrou na fila.`);
    await loadJobs(false);
  } catch (error) { toast(error.message, "error"); } finally { submit.disabled = false; }
});

listRoot.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-cancel-job]");
  if (!button) return;
  button.disabled = true;
  try {
    const job = await api(`/analysis-jobs/${button.dataset.cancelJob}/cancel`, { method: "POST" });
    toast(`Execução #${job.id} cancelada/solicitada.`);
    await loadJobs(false);
  } catch (error) { toast(error.message, "error"); if (button.isConnected) button.disabled = false; }
});

strategySelect.addEventListener("change", () => {
  const selected = strategies.find((item) => item.latestVersionId === Number(strategySelect.value));
  if (selected) applyConfig(selected.config);
  else if (selectedHistoricalVersion?.id === Number(strategySelect.value)) applyConfig(selectedHistoricalVersion.config);
});
kind.addEventListener("change", syncFields);
experiment.addEventListener("change", syncFields);
lottery.addEventListener("change", async () => {
  const requestedLottery = lottery.value;
  localStorage.setItem("loto-lab:lottery", requestedLottery);
  syncFields();
  await Promise.all([loadStrategies(), loadJobs()]);
  if (lottery.value !== requestedLottery) return;
});
refreshButton.addEventListener("click", () => { void loadJobs(); });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void loadJobs(false);
  else clearTimeout(pollTimer);
});

const params = new URLSearchParams(location.search);
const requestedLottery = params.get("lottery");
const storedLottery = localStorage.getItem("loto-lab:lottery");
lottery.value = LABELS[requestedLottery] ? requestedLottery : LABELS[storedLottery] ? storedLottery : "mega-sena";
syncFields();
await loadStrategies(params.get("strategyVersionId"));
await loadJobs();