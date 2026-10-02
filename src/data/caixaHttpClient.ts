import { recordCaixaAttempt, recordCaixaRequest } from "../observability/caixaMetrics.js";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type SleepLike = (milliseconds: number) => Promise<void>;

export interface CaixaHttpPolicy {
  totalTimeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export class CaixaRequestError extends Error {
  constructor(
    message: string,
    public readonly code: "timeout" | "network" | "http" | "not-found" | "invalid-response",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class CaixaTimeoutError extends CaixaRequestError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, "timeout", options);
  }
}

export class CaixaNetworkError extends CaixaRequestError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, "network", options);
  }
}

export class CaixaHttpError extends CaixaRequestError {
  constructor(
    message: string,
    public readonly status: number,
    options?: { cause?: unknown },
  ) {
    super(message, status === 404 ? "not-found" : "http", options);
  }
}

export class CaixaNotFoundError extends CaixaHttpError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 404, options);
  }
}

export class CaixaInvalidResponseError extends CaixaRequestError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, "invalid-response", options);
  }
}

const DEFAULT_POLICY = {
  totalTimeoutMs: 12_000,
  maxAttempts: 3,
  baseDelayMs: 150,
  maxDelayMs: 1_000,
} as const;

const defaultSleep: SleepLike = async (milliseconds) => {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
};

function isTimeout(error: unknown): boolean {
  return error instanceof Error
    && (error.name === "TimeoutError" || error.name === "AbortError");
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function validatePolicy(policy: Required<CaixaHttpPolicy>): void {
  if (!Number.isFinite(policy.totalTimeoutMs) || policy.totalTimeoutMs < 1_000 || policy.totalTimeoutMs > 60_000) {
    throw new Error("Caixa timeout must be between 1000 and 60000 ms");
  }
  if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1 || policy.maxAttempts > 5) {
    throw new Error("Caixa maxAttempts must be an integer between 1 and 5");
  }
  if (!Number.isFinite(policy.baseDelayMs) || policy.baseDelayMs < 0 || policy.baseDelayMs > 5_000) {
    throw new Error("Caixa baseDelayMs must be between 0 and 5000 ms");
  }
  if (!Number.isFinite(policy.maxDelayMs) || policy.maxDelayMs < policy.baseDelayMs || policy.maxDelayMs > 10_000) {
    throw new Error("Caixa maxDelayMs must be between baseDelayMs and 10000 ms");
  }
}

export class CaixaHttpClient {
  private readonly policy: Required<CaixaHttpPolicy>;

  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    policy: CaixaHttpPolicy = {},
    private readonly sleep: SleepLike = defaultSleep,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
    validatePolicy(this.policy);
  }

  async getJson<T>(url: string, subject: string): Promise<T> {
    const startedAt = this.now();
    let lastError: CaixaRequestError | undefined;
    let attemptsUsed = 0;

    for (let attempt = 1; attempt <= this.policy.maxAttempts; attempt += 1) {
      attemptsUsed = attempt;
      const elapsed = this.now() - startedAt;
      const remainingMs = Math.max(0, this.policy.totalTimeoutMs - elapsed);
      if (remainingMs < 1) {
        lastError = new CaixaTimeoutError(`Caixa request timed out for ${subject}`);
        break;
      }

      try {
        const response = await this.fetchImpl(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(Math.max(1, Math.floor(remainingMs))),
        });

        if (!response.ok) {
          const error = response.status === 404
            ? new CaixaNotFoundError(`Caixa request returned 404 for ${subject}`)
            : new CaixaHttpError(`Caixa request failed (${response.status}) for ${subject}`, response.status);
          recordCaixaAttempt("http-error");
          if (!retryableStatus(response.status) || attempt === this.policy.maxAttempts) {
            lastError = error;
            break;
          }
          lastError = error;
        } else {
          try {
            const payload = await response.json() as T;
            recordCaixaAttempt(attempt === 1 ? "success" : "success-after-retry");
            recordCaixaRequest("success", this.now() - startedAt, attempt);
            return payload;
          } catch (error) {
            recordCaixaAttempt("invalid-response");
            lastError = new CaixaInvalidResponseError(
              `Caixa returned invalid JSON for ${subject}`,
              { cause: error },
            );
            break;
          }
        }
      } catch (error) {
        if (isTimeout(error)) {
          recordCaixaAttempt("timeout");
          lastError = new CaixaTimeoutError(`Caixa request timed out for ${subject}`, { cause: error });
        } else {
          recordCaixaAttempt("network-error");
          lastError = new CaixaNetworkError(`Caixa network request failed for ${subject}`, { cause: error });
        }
        if (attempt === this.policy.maxAttempts) break;
      }

      const delay = Math.min(
        this.policy.maxDelayMs,
        this.policy.baseDelayMs * (2 ** (attempt - 1)),
      );
      const remainingAfterAttempt = this.policy.totalTimeoutMs - (this.now() - startedAt);
      if (delay >= remainingAfterAttempt) {
        lastError = new CaixaTimeoutError(`Caixa request timed out for ${subject}`, { cause: lastError });
        break;
      }
      if (delay > 0) await this.sleep(delay);
    }

    const finalError = lastError ?? new CaixaNetworkError(`Caixa request failed for ${subject}`);
    recordCaixaRequest(
      finalError instanceof CaixaTimeoutError ? "timeout" : "error",
      this.now() - startedAt,
      Math.max(1, attemptsUsed),
    );
    throw finalError;
  }
}
