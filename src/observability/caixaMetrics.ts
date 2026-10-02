const LATENCY_SAMPLE_LIMIT = 256;

type CaixaOutcome = "success" | "error" | "timeout";
export type CaixaAttemptOutcome =
  | "success"
  | "success-after-retry"
  | "http-error"
  | "network-error"
  | "timeout"
  | "invalid-response";

interface MutableCaixaMetrics {
  requests: number;
  successes: number;
  errors: number;
  timeouts: number;
  attempts: number;
  retries: number;
  recoveredAfterRetry: number;
  finalFailures: number;
  attemptOutcomes: Record<CaixaAttemptOutcome, number>;
  latencyMs: number[];
}

export interface CaixaMetricsSnapshot {
  scope: "process";
  requests: number;
  successes: number;
  errors: number;
  timeouts: number;
  attempts: number;
  retries: number;
  recoveredAfterRetry: number;
  finalFailures: number;
  attemptOutcomes: Record<CaixaAttemptOutcome, number>;
  errorRate: number;
  timeoutRate: number;
  latencyMs: {
    samples: number;
    p50: number | null;
    p95: number | null;
    p99: number | null;
  };
}

function emptyAttemptOutcomes(): Record<CaixaAttemptOutcome, number> {
  return {
    success: 0,
    "success-after-retry": 0,
    "http-error": 0,
    "network-error": 0,
    timeout: 0,
    "invalid-response": 0,
  };
}

const metrics: MutableCaixaMetrics = {
  requests: 0,
  successes: 0,
  errors: 0,
  timeouts: 0,
  attempts: 0,
  retries: 0,
  recoveredAfterRetry: 0,
  finalFailures: 0,
  attemptOutcomes: emptyAttemptOutcomes(),
  latencyMs: [],
};

function percentile(values: number[], probability: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(probability * sorted.length) - 1;
  return Number(sorted[Math.max(0, index)]!.toFixed(2));
}

function rate(count: number, total: number): number {
  if (total === 0) return 0;
  return Number((count / total).toFixed(6));
}

export function recordCaixaAttempt(outcome: CaixaAttemptOutcome): void {
  metrics.attempts += 1;
  metrics.attemptOutcomes[outcome] += 1;
  if (outcome === "success-after-retry") metrics.recoveredAfterRetry += 1;
}

export function recordCaixaRequest(
  outcome: CaixaOutcome,
  durationMs: number,
  attempts = 1,
): void {
  metrics.requests += 1;
  metrics.retries += Math.max(0, attempts - 1);
  if (outcome === "success") metrics.successes += 1;
  else if (outcome === "timeout") {
    metrics.timeouts += 1;
    metrics.finalFailures += 1;
  } else {
    metrics.errors += 1;
    metrics.finalFailures += 1;
  }

  if (Number.isFinite(durationMs) && durationMs >= 0) {
    metrics.latencyMs.push(durationMs);
    if (metrics.latencyMs.length > LATENCY_SAMPLE_LIMIT) {
      metrics.latencyMs.splice(0, metrics.latencyMs.length - LATENCY_SAMPLE_LIMIT);
    }
  }
}

export function caixaMetricsSnapshot(): CaixaMetricsSnapshot {
  return {
    scope: "process",
    requests: metrics.requests,
    successes: metrics.successes,
    errors: metrics.errors,
    timeouts: metrics.timeouts,
    attempts: metrics.attempts,
    retries: metrics.retries,
    recoveredAfterRetry: metrics.recoveredAfterRetry,
    finalFailures: metrics.finalFailures,
    attemptOutcomes: { ...metrics.attemptOutcomes },
    errorRate: rate(metrics.errors, metrics.requests),
    timeoutRate: rate(metrics.timeouts, metrics.requests),
    latencyMs: {
      samples: metrics.latencyMs.length,
      p50: percentile(metrics.latencyMs, 0.5),
      p95: percentile(metrics.latencyMs, 0.95),
      p99: percentile(metrics.latencyMs, 0.99),
    },
  };
}

export function resetCaixaMetricsForTests(): void {
  metrics.requests = 0;
  metrics.successes = 0;
  metrics.errors = 0;
  metrics.timeouts = 0;
  metrics.attempts = 0;
  metrics.retries = 0;
  metrics.recoveredAfterRetry = 0;
  metrics.finalFailures = 0;
  metrics.attemptOutcomes = emptyAttemptOutcomes();
  metrics.latencyMs.length = 0;
}
