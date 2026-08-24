import { Worker } from "node:worker_threads";
import type { Contest } from "../domain/types.js";
import type { BacktestRoundArtifact } from "../persistence/types.js";
import type {
  StrategyLabOptions,
  StrategyLabResult,
} from "../lab/strategyLab.js";
import {
  BacktestRoundLimitError,
  MAX_HTTP_BACKTEST_ROUNDS,
  type LotoLabApiServices,
  type RunBacktestRequest,
  type RunBacktestResponse,
} from "./services.js";
import { STRATEGY_LAB_TIMEOUT_MS } from "./strategyLabInput.js";

export const ANALYSIS_WORKER_TIMEOUT_MS = 60_000;
const ANALYSIS_WORKER_OLD_GENERATION_MB = 256;
const ANALYSIS_WORKER_YOUNG_GENERATION_MB = 64;

interface WorkerErrorPayload {
  name: string;
  message: string;
  code?: string;
  stack?: string;
}

interface WorkerMessage<T> {
  ok: boolean;
  result?: T;
  error?: WorkerErrorPayload;
}

interface ComputedBacktest {
  options: Record<string, unknown>;
  summary: Record<string, unknown>;
  rounds: BacktestRoundArtifact[];
}

type StrategyBacktestRequest = RunBacktestRequest & {
  strategyId?: number;
  strategyVersionId?: number;
};

export class AnalysisCancelledError extends Error {
  constructor() {
    super("Analysis was cancelled");
    this.name = "AnalysisCancelledError";
  }
}

export class AnalysisTimeoutError extends Error {
  readonly code = "ANALYSIS_TIMEOUT";

  constructor(readonly timeoutMs = ANALYSIS_WORKER_TIMEOUT_MS) {
    super(`Analysis worker exceeded the ${timeoutMs}ms execution limit`);
    this.name = "AnalysisTimeoutError";
  }
}

interface WorkerExecutionOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxOldGenerationSizeMb?: number;
  maxYoungGenerationSizeMb?: number;
}

function runWorker<T>(workerData: unknown, options: WorkerExecutionOptions = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? ANALYSIS_WORKER_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 10 * 60_000) {
      reject(new Error("Analysis worker timeout must be between 1000 and 600000 ms"));
      return;
    }
    if (options.signal?.aborted) {
      reject(new AnalysisCancelledError());
      return;
    }

    let worker: Worker;
    try {
      worker = new Worker(new URL("./analysisWorker.js", import.meta.url), {
        workerData,
        name: "loto-lab-analysis",
        resourceLimits: {
          maxOldGenerationSizeMb: options.maxOldGenerationSizeMb ?? ANALYSIS_WORKER_OLD_GENERATION_MB,
          maxYoungGenerationSizeMb: options.maxYoungGenerationSizeMb ?? ANALYSIS_WORKER_YOUNG_GENERATION_MB,
        },
      });
    } catch (error) {
      reject(error);
      return;
    }

    let settled = false;
    let timeout: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const terminate = () => void worker.terminate().catch(() => undefined);
    const onAbort = () => {
      finish(() => {
        terminate();
        reject(new AnalysisCancelledError());
      });
    };

    options.signal?.addEventListener("abort", onAbort, { once: true });
    timeout = setTimeout(() => {
      finish(() => {
        terminate();
        reject(new AnalysisTimeoutError(timeoutMs));
      });
    }, timeoutMs);
    timeout.unref?.();

    worker.once("message", (message: WorkerMessage<T>) => {
      finish(() => {
        if (message.ok && message.result !== undefined) {
          resolve(message.result);
          return;
        }
        const payload = message.error ?? { name: "Error", message: "Analysis worker failed" };
        const error = new Error(payload.message) as Error & { code?: string };
        error.name = payload.name;
        if (payload.code) error.code = payload.code;
        if (payload.stack) error.stack = payload.stack;
        reject(error);
      });
    });
    worker.once("messageerror", (error) => finish(() => reject(error)));
    worker.once("error", (error) => finish(() => reject(error)));
    worker.once("exit", (code) => {
      finish(() => reject(new Error(
        code === 0
          ? "Analysis worker exited before returning a result"
          : `Analysis worker exited with code ${code}`,
      )));
    });
  });
}

function eligibleRoundCount(contests: Contest[], input: RunBacktestRequest): number {
  return contests
    .slice(input.warmupContests)
    .filter((contest) => input.startContest === undefined || contest.number >= input.startContest)
    .filter((contest) => input.endContest === undefined || contest.number <= input.endContest)
    .length;
}

export interface RunBacktestWorkerOptions {
  signal?: AbortSignal;
  enforceHttpRoundLimit?: boolean;
  timeoutMs?: number;
}

export async function runBacktestInWorker(
  services: LotoLabApiServices,
  input: StrategyBacktestRequest,
  options: RunBacktestWorkerOptions = {},
): Promise<RunBacktestResponse> {
  const contests = await services.contests.list({ lottery: input.lottery, order: "asc" });
  const roundCount = eligibleRoundCount(contests, input);
  if ((options.enforceHttpRoundLimit ?? true) && roundCount > MAX_HTTP_BACKTEST_ROUNDS) {
    throw new BacktestRoundLimitError(roundCount);
  }

  const computed = await runWorker<ComputedBacktest>(
    { kind: "backtest", contests, input },
    { signal: options.signal, timeoutMs: options.timeoutMs ?? ANALYSIS_WORKER_TIMEOUT_MS },
  );
  if (!input.persist) {
    return {
      lottery: input.lottery,
      options: computed.options,
      summary: computed.summary,
      roundCount: computed.rounds.length,
    };
  }

  const saved = await services.backtests.save({
    lottery: input.lottery,
    ...(input.strategyId !== undefined ? { strategyId: input.strategyId } : {}),
    ...(input.strategyVersionId !== undefined ? { strategyVersionId: input.strategyVersionId } : {}),
    options: computed.options,
    summary: computed.summary,
    rounds: computed.rounds,
  });

  return {
    id: saved.id,
    lottery: saved.lottery,
    options: saved.options ?? {},
    summary: saved.summary,
    roundCount: saved.rounds.length,
    createdAt: saved.createdAt,
  };
}

export async function runStrategyLabInWorker(
  contests: Contest[],
  input: StrategyLabOptions,
  signal?: AbortSignal,
): Promise<StrategyLabResult> {
  return runWorker<StrategyLabResult>(
    { kind: "strategy-lab", contests, input },
    { signal, timeoutMs: STRATEGY_LAB_TIMEOUT_MS },
  );
}
