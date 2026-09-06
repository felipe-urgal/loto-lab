const LATENCY_SAMPLE_LIMIT = 256;

type OpenAiOutcome = "success" | "error" | "timeout";

interface MutableOpenAiMetrics {
  requests: number;
  successes: number;
  errors: number;
  timeouts: number;
  latencyMs: number[];
  usageSamples: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface OpenAiMetricsSnapshot {
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
  usage: {
    samples: number;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
}

const metrics: MutableOpenAiMetrics = {
  requests: 0,
  successes: 0,
  errors: 0,
  timeouts: 0,
  latencyMs: [],
  usageSamples: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
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

function tokenCount(usage: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = usage?.[key];
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function recordOpenAiRequest(
  outcome: OpenAiOutcome,
  durationMs: number,
  usage?: Record<string, unknown>,
): void {
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

  if (outcome !== "success") return;
  const inputTokens = tokenCount(usage, "input_tokens");
  const outputTokens = tokenCount(usage, "output_tokens");
  const totalTokens = tokenCount(usage, "total_tokens");
  if (inputTokens === undefined || outputTokens === undefined || totalTokens === undefined) return;

  metrics.usageSamples += 1;
  metrics.inputTokens += inputTokens;
  metrics.outputTokens += outputTokens;
  metrics.totalTokens += totalTokens;
}

export function openAiMetricsSnapshot(): OpenAiMetricsSnapshot {
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
    usage: {
      samples: metrics.usageSamples,
      inputTokens: metrics.usageSamples > 0 ? metrics.inputTokens : null,
      outputTokens: metrics.usageSamples > 0 ? metrics.outputTokens : null,
      totalTokens: metrics.usageSamples > 0 ? metrics.totalTokens : null,
    },
  };
}

export function resetOpenAiMetricsForTests(): void {
  metrics.requests = 0;
  metrics.successes = 0;
  metrics.errors = 0;
  metrics.timeouts = 0;
  metrics.latencyMs.length = 0;
  metrics.usageSamples = 0;
  metrics.inputTokens = 0;
  metrics.outputTokens = 0;
  metrics.totalTokens = 0;
}
