const LATENCY_SAMPLE_LIMIT = 256;

type CaixaOutcome = "success" | "error" | "timeout";

interface MutableCaixaMetrics {
  requests: number;
  successes: number;
  errors: number;
  timeouts: number;
  latencyMs: number[];
}

export interface CaixaMetricsSnapshot {
  scope: "process";
  requests: number;
  successes: number;
  errors: number;
  timeouts: number;
  errorRate: number;
  timeoutRate: number;
  latencyMs: {
    samples: number;
    p50: number | null;
    p95: number | null;
    p99: number | null;
  };
}

const metrics: MutableCaixaMetrics = {
  requests: 0,
  successes: 0,
  errors: 0,
  timeouts: 0,
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

export function recordCaixaRequest(outcome: CaixaOutcome, durationMs: number): void {
  metrics.requests += 1;
  if (outcome === "success") metrics.successes += 1;
  else if (outcome === "timeout") metrics.timeouts += 1;
  else metrics.errors += 1;

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
  metrics.latencyMs.length = 0;
}
