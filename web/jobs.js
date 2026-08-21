const API = "/api/v1";
const LABELS = {
  "mega-sena": "Mega-Sena",
  lotofacil: "Lotofácil",
  "dia-de-sorte": "Dia de Sorte",
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
const labFields = [...document.querySelectorAll("[data-lab-field]")];
const refreshButton = document.querySelector("#jobs-refresh");
const listRoot = document.querySelector("#jobs-list");
const countRoot = document.querySelector("#jobs-count");

let strategies = [];
let jobs = [];
let pollTimer;
let loadToken = 0;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatPercent(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${(value * 100).toFixed(1).replace(".", ",")}%`
    : "—";
}

function toast(message, type = "info") {
  const root = document.querySelector("#toast-root");
  const item = document.createElement("div");
  item.className = `toast ${type === "error" ? "error" : ""}`;
  item.textContent = message;
  root.append(item);
  window.setTimeout(() => item.remove(), 3600);
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...(options.headers || {}) } : options.headers,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Erro HTTP ${response.status}`);
    error.code = payload?.error?.code || "HTTP_ERROR";
    throw error;
  }
  return payload;
}

function syncFields() {
  const isLab = kind.value === "strategy-lab";
  labFields.forEach((field) => { field.hidden = !isLab; });
  fixedField.hidden = lottery.value !== "lotofacil";
  [...experiment.options].forEach((option) => {
    if (option.value === "external-rules") option.disabled = lottery.value !== "mega-sena";
  });
  if (lottery.value !== "mega-sena" && experiment.value === "external-rules") experiment.value = "fixed-core";
}

function applyStrategy(strategy) {
  const config = strategy?.config || {};
  games.value = config.gameCount ?? games.value;
  warmup.value = config.warmupContests ?? warmup.value;
  fixed.value = config.fixedCount ?? fixed.value;
  experiment.value = config.experiment ?? experiment.value;
  lookback.value = config.lookbackContests ?? lookback.value;
  bucket.value = config.bucketSize ?? bucket.value;
  syncFields();
}

async function loadStrategies(preferredVersionId) {
  try {
    const data = await api(`/strategies?lottery=${encodeURIComponent(lottery.value)}`);
    strategies = data.items || [];
    strategySelect.innerHTML = '<option value="">Configuração manual</option>' + strategies.map((strategy) =>
      `<option value="${strategy.latestVersionId}">${escapeHtml(strategy.name)} · v${strategy.version} (#${strategy.latestVersionId})</option>`,
    ).join("");
    if (preferredVersionId && [...strategySelect.options].some((option) => option.value === String(preferredVersionId))) {
      strategySelect.value = String(preferredVersionId);
    }
    const selected = strategies.find((item) => item.latestVersionId === Number(strategySelect.value));
    if (selected) applyStrategy(selected);
  } catch (error) {
    strategies = [];
    strategySelect.innerHTML = '<option value="">Estratégias indisponíveis</option>';
    toast(error.message, "error");
  }
}

function jobResult(job) {
  if (job.status === "running") return '<div class="job-running"><span class="spinner"></span>Processando em worker dedicado</div>';
  if (job.status === "queued") return '<div class="job-result">Aguardando o gate de análises.</div>';
  if (job.status === "cancelled") return '<div class="job-result job-error">Execução cancelada.</div>';
  if (job.status === "failed") return `<div class="job-result job-error"><strong>${escapeHtml(job.error?.code || "ERROR")}</strong>${escapeHtml(job.error?.message || "Falha na execução")}</div>`;
  if (!job.result) return "";

  if (job.kind === "backtest") {
    const summary = job.result.summary || {};
    return `<div class="job-result"><strong>Backtest ${job.result.id ? `#${job.result.id}` : "concluído"}</strong><span>${job.result.roundCount ?? "—"} concursos · ROI ${escapeHtml(formatPercent(summary.roi))} · cobertura ${escapeHtml(formatPercent(summary.financialCoverage))}</span></div>`;
  }

  return `<div class="job-result"><strong>Laboratório concluído</strong><span>Vencedor: ${escapeHtml(job.result.winner || "empate/indefinido")} · ${job.result.variants?.length ?? 0} variantes · ranking por ${escapeHtml(job.result.rankingBasis || "—")}</span></div>`;
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
          <div><h3>#${job.id} · ${job.kind === "backtest" ? "Backtest" : "Laboratório"}</h3><p>${escapeHtml(LABELS[job.lottery])} · criada ${escapeHtml(formatDate(job.createdAt))}</p></div>
          <span class="status-pill ${job.status}">${escapeHtml(job.status)}</span>
        </div>
        <div class="experiment-meta">
          ${strategyVersionId ? `<span>estratégia #${strategyVersionId}</span>` : ""}
          <span>${job.input?.gameCount ?? "—"} jogos</span>
          <span>warmup ${job.input?.warmupContests ?? "—"}</span>
          ${job.startedAt ? `<span>início ${escapeHtml(formatDate(job.startedAt))}</span>` : ""}
          ${job.finishedAt ? `<span>fim ${escapeHtml(formatDate(job.finishedAt))}</span>` : ""}
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
  const token = ++loadToken;
  if (showLoading) listRoot.innerHTML = '<div class="loading-state"><span class="spinner"></span><span>Carregando execuções...</span></div>';
  refreshButton.disabled = true;
  try {
    const data = await api(`/analysis-jobs?lottery=${encodeURIComponent(lottery.value)}&limit=100`);
    if (token !== loadToken) return;
    jobs = data.items || [];
    renderJobs();
    schedulePoll();
  } catch (error) {
    if (token !== loadToken) return;
    listRoot.innerHTML = `<div class="panel experiment-empty job-error">${escapeHtml(error.message)}</div>`;
  } finally {
    if (token === loadToken) refreshButton.disabled = false;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const body = {
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
    }
    const job = await api("/analysis-jobs", { method: "POST", body: JSON.stringify(body) });
    toast(`Execução #${job.id} entrou na fila.`);
    await loadJobs(false);
  } catch (error) {
    toast(error.message, "error");
  } finally {
    submit.disabled = false;
  }
});

listRoot.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-cancel-job]");
  if (!button) return;
  button.disabled = true;
  try {
    const job = await api(`/analysis-jobs/${button.dataset.cancelJob}/cancel`, { method: "POST" });
    toast(`Execução #${job.id} cancelada/solicitada.`);
    await loadJobs(false);
  } catch (error) {
    toast(error.message, "error");
    if (button.isConnected) button.disabled = false;
  }
});

strategySelect.addEventListener("change", () => {
  const selected = strategies.find((item) => item.latestVersionId === Number(strategySelect.value));
  if (selected) applyStrategy(selected);
});
kind.addEventListener("change", syncFields);
lottery.addEventListener("change", async () => {
  localStorage.setItem("loto-lab:lottery", lottery.value);
  syncFields();
  await loadStrategies();
  await loadJobs();
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
