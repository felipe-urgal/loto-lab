import type { LotteryId } from "../../core/mainContext.js";
import { escapeHtml } from "../../shared/escaping.js";
import { formatDateTime, formatPercent } from "../../shared/formatters.js";

type JobKind = "backtest" | "strategy-lab";

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

export type AnalysisJob = {
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

const lotteryLabels: Record<LotteryId, string> = {
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

function statusClass(status: string): string {
  return knownStatusClasses.has(status) ? status : "unknown";
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

function ownerAction(job: AnalysisJob): string {
  if (job.kind !== "backtest") {
    return '<a class="button compact" href="/lab">Abrir Laboratório</a>';
  }
  const completed = (job.status === "completed" || job.status === "succeeded") && job.result;
  const href = completed
    ? `/?jobId=${encodeURIComponent(String(job.id))}&lottery=${encodeURIComponent(job.lottery)}#backtests`
    : "/#backtests";
  return `<a class="button compact" href="${href}">Abrir Testes históricos</a>`;
}

export function renderJobCard(job: AnalysisJob): string {
  const id = escapeHtml(job.id);
  const canCancel = job.status === "queued" || job.status === "running";
  const kindLabel = job.kind === "backtest" ? "Teste histórico" : "Laboratório";
  const lotteryLabel = lotteryLabels[job.lottery] ?? job.lottery;
  const statusLabel = statusLabels[job.status] ?? job.status;
  const cancelAction = canCancel
    ? `<button class="button compact danger" type="button" data-cancel-job="${id}">Cancelar</button>`
    : "";
  return `
    <article class="panel experiment-card" data-job-id="${id}">
      <div class="experiment-card-head">
        <div><h3>#${id} · ${kindLabel}</h3><p>${escapeHtml(lotteryLabel)} · criada ${escapeHtml(formatDateTime(job.createdAt))}</p></div>
        <span class="status-pill ${statusClass(job.status)}">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="experiment-meta">${renderJobMeta(job)}</div>
      ${jobResult(job)}
      <div class="experiment-card-actions">${ownerAction(job)}${cancelAction}</div>
    </article>`;
}
