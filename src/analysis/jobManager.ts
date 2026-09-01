import type { Pool } from "pg";
import type { RunBacktestRequest } from "../application/runBacktest.js";
import type { StrategyLabOptions } from "../lab/strategyLab.js";
import {
  PostgresAnalysisJobRepository,
  type AnalysisJobKind,
  type AnalysisJobRecord,
} from "../persistence/analysisJobRepository.js";
import { PostgresBacktestRepository } from "../persistence/backtestRepository.js";
import { PostgresContestRepository } from "../persistence/contestRepository.js";
import {
  AnalysisCancelledError,
  runBacktestInWorker,
  runStrategyLabInWorker,
  type BacktestWorkerServices,
} from "../api/workerClient.js";
import { expensiveAnalysisGate } from "../api/workGate.js";
import { logEvent } from "../observability/log.js";

const managers = new WeakMap<Pool, AnalysisJobManager>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serializedError(error: unknown): { code?: string; message: string } {
  const code = error && typeof error === "object" && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  return {
    ...(typeof code === "string" ? { code } : {}),
    message: error instanceof Error ? error.message : String(error),
  };
}

export class AnalysisJobManager {
  private readonly repository: PostgresAnalysisJobRepository;
  private readonly contests: PostgresContestRepository;
  private readonly backtestServices: BacktestWorkerServices;
  private running?: Promise<void>;
  private stopped = false;
  private retryTimer?: NodeJS.Timeout;
  private rerunRequested = false;
  private readonly activeControllers = new Map<number, AbortController>();
  private readonly explicitCancels = new Set<number>();

  constructor(pool: Pool) {
    this.repository = new PostgresAnalysisJobRepository(pool);
    this.contests = new PostgresContestRepository(pool);
    this.backtestServices = {
      contests: this.contests,
      backtests: new PostgresBacktestRepository(pool),
    };
  }

  async start(): Promise<number> {
    this.stopped = false;
    const recovered = await this.repository.recoverRunning();
    this.kick();
    return recovered;
  }

  async enqueue(kind: AnalysisJobKind, lottery: AnalysisJobRecord["lottery"], input: Record<string, unknown>): Promise<AnalysisJobRecord> {
    const job = await this.repository.create(kind, lottery, input);
    logEvent("info", "analysis_job_enqueued", { jobId: job.id, kind, lottery });
    this.kick();
    return job;
  }

  async cancel(id: number): Promise<AnalysisJobRecord | undefined> {
    const job = await this.repository.cancel(id);
    if (job?.status === "running") {
      this.explicitCancels.add(id);
      this.activeControllers.get(id)?.abort();
    }
    if (job) logEvent("info", "analysis_job_cancel_requested", { jobId: id, status: job.status });
    return job;
  }

  async findById(id: number): Promise<AnalysisJobRecord | undefined> {
    return this.repository.findById(id);
  }

  async list(limit: number, lottery?: AnalysisJobRecord["lottery"]): Promise<AnalysisJobRecord[]> {
    return this.repository.list(limit, lottery);
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.kick();
    }, 500);
    this.retryTimer.unref();
  }

  private kick(): void {
    if (this.stopped) return;
    if (this.running) {
      this.rerunRequested = true;
      return;
    }

    this.rerunRequested = false;
    let drainFailed = false;
    this.running = this.drain()
      .catch((error: unknown) => {
        drainFailed = true;
        const serialized = serializedError(error);
        logEvent("error", "analysis_job_drain_failed", {
          code: serialized.code,
          message: serialized.message,
        });
      })
      .finally(() => {
        this.running = undefined;
        if (this.stopped) return;
        if (this.rerunRequested) {
          this.kick();
        } else if (drainFailed) {
          this.scheduleRetry();
        }
      });
  }

  private async execute(job: AnalysisJobRecord, signal: AbortSignal): Promise<Record<string, unknown>> {
    if (job.kind === "backtest") {
      const result = await runBacktestInWorker(
        this.backtestServices,
        job.input as unknown as RunBacktestRequest,
        { signal },
      );
      return result as unknown as Record<string, unknown>;
    }

    const contests = await this.contests.list({ lottery: job.lottery, order: "asc" });
    const result = await runStrategyLabInWorker(
      contests,
      job.input as unknown as StrategyLabOptions,
      signal,
    );
    return result as unknown as Record<string, unknown>;
  }

  private async drain(): Promise<void> {
    while (!this.stopped) {
      const release = expensiveAnalysisGate.acquire();
      if (!release) {
        this.scheduleRetry();
        return;
      }

      let job: AnalysisJobRecord | undefined;
      try {
        job = await this.repository.claimNext();
        if (!job) return;

        const startedAt = Date.now();
        logEvent("info", "analysis_job_started", { jobId: job.id, kind: job.kind, lottery: job.lottery });
        const controller = new AbortController();
        this.activeControllers.set(job.id, controller);
        try {
          const result = await this.execute(job, controller.signal);
          const latest = await this.repository.findById(job.id);
          if (latest?.cancelRequested) {
            await this.repository.markCancelled(job.id);
            logEvent("info", "analysis_job_cancelled", { jobId: job.id, durationMs: Date.now() - startedAt });
          } else {
            await this.repository.complete(job.id, result);
            logEvent("info", "analysis_job_completed", { jobId: job.id, durationMs: Date.now() - startedAt });
          }
        } catch (error) {
          if (error instanceof AnalysisCancelledError) {
            if (!this.stopped || this.explicitCancels.has(job.id)) {
              await this.repository.markCancelled(job.id).catch(() => undefined);
            }
            logEvent("info", "analysis_job_cancelled", { jobId: job.id, durationMs: Date.now() - startedAt });
          } else {
            const serialized = serializedError(error);
            await this.repository.fail(job.id, serialized).catch(() => undefined);
            logEvent("error", "analysis_job_failed", {
              jobId: job.id,
              durationMs: Date.now() - startedAt,
              code: serialized.code,
              message: serialized.message,
            });
          }
        } finally {
          this.activeControllers.delete(job.id);
          this.explicitCancels.delete(job.id);
        }
      } finally {
        release();
      }

      await delay(0);
    }
  }

  async stopAndDrain(): Promise<void> {
    this.stopped = true;
    this.rerunRequested = false;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
    for (const controller of this.activeControllers.values()) controller.abort();
    await this.running;
  }
}

export function getAnalysisJobManager(pool: Pool): AnalysisJobManager {
  let manager = managers.get(pool);
  if (!manager) {
    manager = new AnalysisJobManager(pool);
    managers.set(pool, manager);
  }
  return manager;
}
