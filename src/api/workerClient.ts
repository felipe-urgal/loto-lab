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

function runWorker<T>(workerData: unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const worker = new Worker(new URL("./analysisWorker.js", import.meta.url), { workerData });
    let settled = false;

    worker.once("message", (message: WorkerMessage<T>) => {
      settled = true;
      if (message.ok && message.result !== undefined) {
        resolve(message.result);
        return;
      }
      const payload = message.error ?? { name: "Error", message: "Analysis worker failed" };
      const error = new Error(payload.message) as Error & { code?: string };
      error.name = payload.name;
      if (payload.code) error.code = payload.code;
      reject(error);
    });
    worker.once("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    worker.once("exit", (code) => {
      if (!settled && code !== 0) {
        settled = true;
        reject(new Error(`Analysis worker exited with code ${code}`));
      }
    });
  });
}

function compactBacktestRound(round: BacktestRoundArtifact): BacktestRoundArtifact {
  const compact: BacktestRoundArtifact = { contest: round.contest };
  for (const key of ["date", "targetNumbers", "hitsByGame", "bestHits", "fixedHits"] as const) {
    if (round[key] !== undefined) compact[key] = round[key];
  }
  return compact;
}

function eligibleRoundCount(contests: Contest[], input: RunBacktestRequest): number {
  return contests
    .slice(input.warmupContests)
    .filter((contest) => input.startContest === undefined || contest.number >= input.startContest)
    .filter((contest) => input.endContest === undefined || contest.number <= input.endContest)
    .length;
}

export async function runBacktestInWorker(
  services: LotoLabApiServices,
  input: RunBacktestRequest,
): Promise<RunBacktestResponse> {
  const contests = await services.contests.list({ lottery: input.lottery, order: "asc" });
  const roundCount = eligibleRoundCount(contests, input);
  if (roundCount > MAX_HTTP_BACKTEST_ROUNDS) {
    throw new BacktestRoundLimitError(roundCount);
  }

  const computed = await runWorker<ComputedBacktest>({ kind: "backtest", contests, input });
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
    options: computed.options,
    summary: computed.summary,
    rounds: computed.rounds.map(compactBacktestRound),
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
): Promise<StrategyLabResult> {
  return runWorker<StrategyLabResult>({ kind: "strategy-lab", contests, input });
}
