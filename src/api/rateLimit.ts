import type { IncomingMessage, ServerResponse } from "node:http";

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly options: RateLimitOptions) {
    if (!Number.isInteger(options.limit) || options.limit < 1) {
      throw new Error("rate-limit limit must be a positive integer");
    }
    if (!Number.isFinite(options.windowMs) || options.windowMs < 1000) {
      throw new Error("rate-limit windowMs must be at least 1000 ms");
    }
  }

  consume(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.options.windowMs });
      this.prune(now);
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (current.count >= this.options.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      };
    }

    current.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private prune(now: number): void {
    if (this.buckets.size < 500) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

export function requestClientKey(request: IncomingMessage): string {
  // Do not trust X-Forwarded-For here: it is client-controlled unless every
  // deployment has a carefully configured trusted-proxy chain. Using the
  // socket peer keeps the limiter non-bypassable; behind the recommended
  // localhost reverse proxy this intentionally behaves as a global guardrail.
  return request.socket.remoteAddress || "unknown";
}

export function enforceRateLimit(
  request: IncomingMessage,
  response: ServerResponse,
  limiter: FixedWindowRateLimiter,
  scope: string,
): boolean {
  const result = limiter.consume(`${scope}:${requestClientKey(request)}`);
  if (result.allowed) return true;

  response.statusCode = 429;
  response.setHeader("Retry-After", String(result.retryAfterSeconds));
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify({
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests. Try again later.",
    },
  }));
  return false;
}
