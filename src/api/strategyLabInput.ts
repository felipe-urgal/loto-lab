import type { Contest, LotteryId } from "../domain/types.js";
import { eligibleTargetIndexes } from "../analysis/contestEligibility.js";
import type { StrategyLabExperiment, StrategyLabOptions } from "../lab/strategyLab.js";
import { resolveStrategyLabPeriod } from "../lab/strategyLab.js";
import {
  ApiError,
  parseOptionalPositiveInt,
  parsePositiveInt,
} from "./http.js";

export const STRATEGY_LAB_TIMEOUT_MS = 60_000;
export const MAX_ESTIMATED_LAB_WORK_UNITS = 750_000;

export type ParsedStrategyLabOptions = StrategyLabOptions & {
  lottery: LotteryId;
  experiment: StrategyLabExperiment;
  gameCount: number;
  warmupContests: number;
  lookbackContests: number;
  bucketSize: number;
  randomSamples: number;
};

export function parseStrategyLabExperiment(value: unknown): StrategyLabExperiment {
  if (value === undefined || value === null || value === "") return "fixed-core";
  if (value === "fixed-core" || value === "external-rules" || value === "score-model") return value;
  throw new ApiError(400, "INVALID_ARGUMENT", "experiment must be fixed-core, external-rules or score-model");
}

export function parseStrategyLabOptions(
  values: Record<string, unknown>,
  lottery: LotteryId,
): ParsedStrategyLabOptions {
  const experiment = parseStrategyLabExperiment(values.experiment);
  if (experiment === "external-rules" && lottery !== "mega-sena") {
    throw new ApiError(400, "INVALID_ARGUMENT", "external-rules experiment is available only for Mega-Sena");
  }

  const gameCount = parsePositiveInt(values.gameCount, "gameCount", {
    min: 1,
    max: 10,
    defaultValue: lottery === "mega-sena" ? 2 : 4,
  });
  const warmupContests = parsePositiveInt(values.warmupContests, "warmupContests", {
    min: 1,
    max: 500,
    defaultValue: 20,
  });
  const lookbackContests = parsePositiveInt(values.lookbackContests, "lookbackContests", {
    min: 10,
    max: 500,
    defaultValue: 200,
  });
  const bucketSize = parsePositiveInt(values.bucketSize, "bucketSize", {
    min: 5,
    max: 100,
    defaultValue: 25,
  });
  const randomSamples = parsePositiveInt(values.randomSamples, "randomSamples", {
    min: 10,
    max: 500,
    defaultValue: experiment === "external-rules" ? 250 : 100,
  });
  const startContest = parseOptionalPositiveInt(values.startContest, "startContest");
  const endContest = parseOptionalPositiveInt(values.endContest, "endContest");
  if (startContest !== undefined && endContest !== undefined && startContest > endContest) {
    throw new ApiError(400, "INVALID_ARGUMENT", "startContest must be less than or equal to endContest");
  }

  return {
    lottery,
    experiment,
    gameCount,
    warmupContests,
    lookbackContests,
    bucketSize,
    randomSamples,
    ...(startContest !== undefined ? { startContest } : {}),
    ...(endContest !== undefined ? { endContest } : {}),
  };
}

export function estimateStrategyLabWorkUnits(
  experiment: StrategyLabExperiment,
  eligibleTargets: number,
  gameCount: number,
  randomSamples: number,
): number {
  const strategyVariants = experiment === "external-rules" ? 9 : 3;
  const backtestUnits = eligibleTargets * gameCount * (randomSamples + strategyVariants + 2);
  const scoreAnalysisUnits = experiment === "score-model" ? eligibleTargets * 40 : 0;
  return backtestUnits + scoreAnalysisUnits;
}

export function validateStrategyLabExecution(
  contests: Contest[],
  input: ParsedStrategyLabOptions,
): { eligibleTargets: number; estimatedWorkUnits: number } {
  if (contests.length <= input.warmupContests) {
    throw new ApiError(
      409,
      "INSUFFICIENT_HISTORY",
      `At least ${input.warmupContests + 1} contests are required to compare strategies`,
    );
  }

  const period = resolveStrategyLabPeriod(contests, input);
  const scoped = contests
    .filter((contest) => contest.lottery === input.lottery)
    .sort((a, b) => a.number - b.number);
  const eligibleTargets = eligibleTargetIndexes(scoped, {
    warmupContests: input.warmupContests,
    ...(period.startContest !== undefined ? { startContest: period.startContest } : {}),
    ...(period.endContest !== undefined ? { endContest: period.endContest } : {}),
  }).length;

  if (eligibleTargets === 0) {
    throw new ApiError(
      409,
      "EMPTY_PERIOD",
      "The requested period has no eligible contests after warmup and continuity checks.",
    );
  }

  const estimatedWorkUnits = estimateStrategyLabWorkUnits(
    input.experiment,
    eligibleTargets,
    input.gameCount,
    input.randomSamples,
  );
  if (estimatedWorkUnits > MAX_ESTIMATED_LAB_WORK_UNITS) {
    throw new ApiError(
      400,
      "ANALYSIS_TOO_LARGE",
      "Requested Strategy Lab run is too large. Reduce the effective contest period, games per contest, or random controls.",
    );
  }

  return { eligibleTargets, estimatedWorkUnits };
}
