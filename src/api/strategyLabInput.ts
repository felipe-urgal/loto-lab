import type { LotteryId } from "../domain/types.js";
import type { StrategyLabRunRequest } from "../application/runStrategyLab.js";
import type { StrategyLabExperiment } from "../lab/strategyLab.js";
import {
  ApiError,
  parseOptionalPositiveInt,
  parsePositiveInt,
} from "./http.js";

export {
  MAX_ESTIMATED_LAB_WORK_UNITS,
  estimateStrategyLabWorkUnits,
  validateStrategyLabExecution,
} from "../application/runStrategyLab.js";

export const STRATEGY_LAB_TIMEOUT_MS = 60_000;

export type ParsedStrategyLabOptions = StrategyLabRunRequest;

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
