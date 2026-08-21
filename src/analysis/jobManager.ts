import type { Pool } from "pg";
import type { StrategyLabOptions } from "../lab/strategyLab.js";
import {
  PostgresAnalysisJobRepository,
  type AnalysisJobKind,
  type AnalysisJobRecord,
} from "../persistence/analysisJobRepository.js";
import { LotoLabApiServices, type RunBacktestRequest } from "../api/services.js";
import {
  AnalysisCancelledError,
  runBacktestInWorker,
  runStrategyLabInWorker,
} from "../api/workerClient.js";
import { expensiveAnalysisGate } from "../api/workGate.js";

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
  private readonly services: LotoLabApiServices;
  private running?: Promise<void>;
  private stopped = false;
  private retryTimer?: NodeJS.Timeout;
  private rerunRequested = false;
  private readonly activeControllers = new Map<number, AbortController>();
  private readonly explicitCancels = new Set<number>();

  constructor(private readonly pool: Pool) {
    this.repository = new PostgresAnalysisJobRepository(pool);
    this.services = new LotoLabApiServices(pool);
  }

  async start(): Promise<number> {
    this.stopped = false;
    const recovered = await this.repository.recoverRunning();
    this.kick();
    return recovered;
  }

  async enqueue(kind: AnalysisJobKind, lottery: AnalysisJobRecord["lottery"], input: Record<string, unknown>): Promise<AnalysisJobRecord> {
    const job = await this.repository.create(kind, lottery, input);
    this.kick();
    return job;
  }

  async cancel(id: number): Promise<AnalysisJobRecord | undefined> {
    const job = await this.repository.cancel(id);
    if (job?.status === "running") {
      this.explicitCancels.add(id);
      this.activeControllers.get(id)?.abort();
    }
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
    this.running = this.drain().finally(() => {
      this.running = undefined;
      if (this.rerunRequested && !this.stopped) this.kick();
    });
  }

  private async execute(job: AnalysisJobRecord, signal: AbortSignal): Promise<Record<string, unknown>> {
    if (job.kind === "backtest") {
      const result = await runBacktestInWorker(
        this.services,
        job.input as unknown as RunBacktestRequest,
        { signal, enforceHttpRoundLimit: false },
      );
      return result as unknown as Record<string, unknown>;
    }

    const contests = await this.services.contests.list({ lottery: job.lottery, order: "asc" });
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

        const controller = new AbortController();
        this.activeControllers.set(job.id, controller);
        try {
          const result = await this.execute(job, controller.signal);
          const latest = await this.repository.findById(job.id);
          if (latest?.cancelRequested) await this.repository.markCancelled(job.id);
          else await this.repository.complete(job.id, result);
        } catch (error) {
          if (error instanceof AnalysisCancelledError) {
            if (!this.stopped || this.explicitCancels.has(job.id)) {
              await this.repository.markCancelled(job.id).catch(() => undefined);
            }
          } else {
            await this.repository.fail(job.id, serializedError(error)).catch(() => undefined);
          }
        } finally {
          this.activeControllers.delete(job.id);
          this.explicitCancels.delete(job.id);
        }
      } finally {
        release();
      }

      // Yield between jobs so HTTP and timers get a chance to progress even
      // when a large backlog exists.
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
