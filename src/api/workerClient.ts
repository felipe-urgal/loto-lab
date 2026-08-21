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

function runWorker<T>(workerData: unknown, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AnalysisCancelledError());
      return;
    }

    const worker = new Worker(new URL("./analysisWorker.js", import.meta.url), { workerData });
    let settled = false;

    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => {
      finish(() => {
        void worker.terminate().catch(() => undefined);
        reject(new AnalysisCancelledError());
      });
    };
    signal?.addEventListener("abort", onAbort, { once: true });

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
    options.signal,
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
  return runWorker<StrategyLabResult>({ kind: "strategy-lab", contests, input }, signal);
}
