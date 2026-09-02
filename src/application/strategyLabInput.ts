import type { LotteryId } from "../domain/types.js";
import type { StrategyLabExperiment } from "../lab/strategyLab.js";
import type { StrategyLabRunRequest } from "./runStrategyLab.js";

export class StrategyLabInputError extends Error {
  readonly code = "INVALID_ARGUMENT";
}

function parsePositiveInt(
  raw: unknown,
  field: string,
  options: { min?: number; max?: number; defaultValue?: number } = {},
): number {
  if ((raw === undefined || raw === null || raw === "") && options.defaultValue !== undefined) {
    return options.defaultValue;
  }
  const parsed = typeof raw === "number" ? raw : Number(raw);
  const min = options.min ?? 1;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new StrategyLabInputError(`${field} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function parseOptionalPositiveInt(raw: unknown, field: string): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  return parsePositiveInt(raw, field);
}

export function parseStrategyLabExperiment(value: unknown): StrategyLabExperiment {
  if (value === undefined || value === null || value === "") return "fixed-core";
  if (value === "fixed-core" || value === "external-rules" || value === "score-model") return value;
  throw new StrategyLabInputError("experiment must be fixed-core, external-rules or score-model");
}

export function parseStrategyLabOptions(
  values: Record<string, unknown>,
  lottery: LotteryId,
): StrategyLabRunRequest {
  const experiment = parseStrategyLabExperiment(values.experiment);
  if (experiment === "external-rules" && lottery !== "mega-sena") {
    throw new StrategyLabInputError("external-rules experiment is available only for Mega-Sena");
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
    throw new StrategyLabInputError("startContest must be less than or equal to endContest");
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
