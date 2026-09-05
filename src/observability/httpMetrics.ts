const LATENCY_SAMPLE_LIMIT = 512;

export type HttpRouteFamily =
  | "health"
  | "metrics"
  | "analysis"
  | "generation"
  | "games"
  | "strategies"
  | "operations"
  | "agenda"
  | "ai"
  | "contests"
  | "api.other"
  | "web"
  | "other";

interface MutableHttpMetrics {
  requests: number;
  clientErrors: number;
  serverErrors: number;
  latencyMs: number[];
}

export interface HttpMetricSnapshot {
  family: HttpRouteFamily;
  requests: number;
  clientErrors: number;
  serverErrors: number;
  clientErrorRate: number;
  serverErrorRate: number;
  latencyMs: {
    samples: number;
    p50: number | null;
    p95: number | null;
    p99: number | null;
  };
}

const buckets = new Map<HttpRouteFamily, MutableHttpMetrics>();

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

function isApiPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function classifyHttpRoute(pathname: string): HttpRouteFamily {
  const path = normalizePathname(pathname);

  if (path === "/health" || path === "/health/live" || path === "/health/ready") return "health";
  if (path === "/api/v1/ops/metrics") return "metrics";
  if (
    isApiPrefix(path, "/api/v1/analysis")
    || isApiPrefix(path, "/api/v1/backtests")
    || isApiPrefix(path, "/api/v1/strategy-lab")
  ) return "analysis";
  if (isApiPrefix(path, "/api/v1/generation")) return "generation";
  if (
    isApiPrefix(path, "/api/v1/games")
    || isApiPrefix(path, "/api/v1/game-batches")
    || isApiPrefix(path, "/api/v1/real-bets")
  ) return "games";
  if (isApiPrefix(path, "/api/v1/strategies")) return "strategies";
  if (isApiPrefix(path, "/api/v1/operations")) return "operations";
  if (isApiPrefix(path, "/api/v1/agenda")) return "agenda";
  if (isApiPrefix(path, "/api/v1/ai")) return "ai";
  if (
    isApiPrefix(path, "/api/v1/contests")
    || path === "/api/v1/lotteries"
    || path === "/api/v1/data/status"
  ) return "contests";
  if (isApiPrefix(path, "/api/v1")) return "api.other";
  if (path === "/" || !path.startsWith("/api/")) return "web";
  return "other";
}

function bucketFor(family: HttpRouteFamily): MutableHttpMetrics {
  const existing = buckets.get(family);
  if (existing) return existing;
  const created: MutableHttpMetrics = {
    requests: 0,
    clientErrors: 0,
    serverErrors: 0,
    latencyMs: [],
  };
  buckets.set(family, created);
  return created;
}

export function recordHttpRequest(
  family: HttpRouteFamily,
  statusCode: number,
  durationMs: number,
): void {
  const bucket = bucketFor(family);
  bucket.requests += 1;
  if (statusCode >= 400 && statusCode < 500) bucket.clientErrors += 1;
  if (statusCode >= 500) bucket.serverErrors += 1;

  if (Number.isFinite(durationMs) && durationMs >= 0) {
    bucket.latencyMs.push(durationMs);
    if (bucket.latencyMs.length > LATENCY_SAMPLE_LIMIT) {
      bucket.latencyMs.splice(0, bucket.latencyMs.length - LATENCY_SAMPLE_LIMIT);
    }
  }
}

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

export function httpMetricsSnapshot(): {
  scope: "process";
  generatedAt: string;
  latencySampleLimit: number;
  families: HttpMetricSnapshot[];
} {
  const families = [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([family, bucket]): HttpMetricSnapshot => ({
      family,
      requests: bucket.requests,
      clientErrors: bucket.clientErrors,
      serverErrors: bucket.serverErrors,
      clientErrorRate: rate(bucket.clientErrors, bucket.requests),
      serverErrorRate: rate(bucket.serverErrors, bucket.requests),
      latencyMs: {
        samples: bucket.latencyMs.length,
        p50: percentile(bucket.latencyMs, 0.5),
        p95: percentile(bucket.latencyMs, 0.95),
        p99: percentile(bucket.latencyMs, 0.99),
      },
    }));

  return {
    scope: "process",
    generatedAt: new Date().toISOString(),
    latencySampleLimit: LATENCY_SAMPLE_LIMIT,
    families,
  };
}

export function resetHttpMetricsForTests(): void {
  buckets.clear();
}
