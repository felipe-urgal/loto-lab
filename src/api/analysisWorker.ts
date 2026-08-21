import { parentPort, workerData } from "node:worker_threads";
import type { Contest } from "../domain/types.js";
import { backtestMegaSena } from "../backtest/megaSena.js";
import { backtestLotofacil } from "../backtest/lotofacil.js";
import { backtestDiaDeSorte } from "../backtest/diaDeSorte.js";
import type { BacktestRoundArtifact } from "../persistence/types.js";
import {
  compareStrategyLab,
  type StrategyLabOptions,
} from "../lab/strategyLab.js";
import type { RunBacktestRequest } from "./services.js";

interface BacktestWorkerInput {
  kind: "backtest";
  contests: Contest[];
  input: RunBacktestRequest;
}

interface StrategyLabWorkerInput {
  kind: "strategy-lab";
  contests: Contest[];
  input: StrategyLabOptions;
}

type AnalysisWorkerInput = BacktestWorkerInput | StrategyLabWorkerInput;

function compactBacktestRound(round: BacktestRoundArtifact): BacktestRoundArtifact {
  const compact: BacktestRoundArtifact = { contest: round.contest };
  for (const key of ["date", "targetNumbers", "hitsByGame", "bestHits", "fixedHits"] as const) {
    if (round[key] !== undefined) compact[key] = round[key];
  }
  return compact;
}

function computeBacktest(contests: Contest[], input: RunBacktestRequest) {
  const options: Record<string, unknown> = {
    gameCount: input.gameCount,
    warmupContests: input.warmupContests,
    ...(input.startContest !== undefined ? { startContest: input.startContest } : {}),
    ...(input.endContest !== undefined ? { endContest: input.endContest } : {}),
  };

  let result: { rounds: Array<{ contest: number }>; summary: unknown };
  if (input.lottery === "mega-sena") {
    result = backtestMegaSena(contests, {
      gameCount: input.gameCount,
      warmupContests: input.warmupContests,
      ...(input.startContest !== undefined ? { startContest: input.startContest } : {}),
      ...(input.endContest !== undefined ? { endContest: input.endContest } : {}),
    });
  } else if (input.lottery === "lotofacil") {
    const fixedCount = input.fixedCount ?? 8;
    options.fixedCount = fixedCount;
    result = backtestLotofacil(contests, {
      gameCount: input.gameCount,
      fixedCount,
      warmupContests: input.warmupContests,
      ...(input.startContest !== undefined ? { startContest: input.startContest } : {}),
      ...(input.endContest !== undefined ? { endContest: input.endContest } : {}),
    });
  } else {
    result = backtestDiaDeSorte(contests, {
      gameCount: input.gameCount,
      warmupContests: input.warmupContests,
      ...(input.startContest !== undefined ? { startContest: input.startContest } : {}),
      ...(input.endContest !== undefined ? { endContest: input.endContest } : {}),
    });
  }

  return {
    options,
    summary: result.summary as Record<string, unknown>,
    rounds: (result.rounds as unknown as BacktestRoundArtifact[]).map(compactBacktestRound),
  };
}

function serializeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const codeValue = typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  return {
    name: error instanceof Error ? error.name : "Error",
    message,
    ...(typeof codeValue === "string" ? { code: codeValue } : {}),
    ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
  };
}

const port = parentPort;
if (!port) throw new Error("Analysis worker requires a parent port");

try {
  const job = workerData as AnalysisWorkerInput;
  const result = job.kind === "backtest"
    ? computeBacktest(job.contests, job.input)
    : compareStrategyLab(job.contests, job.input);
  port.postMessage({ ok: true, result });
} catch (error) {
  port.postMessage({ ok: false, error: serializeError(error) });
}
