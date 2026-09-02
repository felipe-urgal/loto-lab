import type { LotteryId } from "../domain/types.js";
import {
  parseStrategyLabExperiment as parseApplicationStrategyLabExperiment,
  parseStrategyLabOptions as parseApplicationStrategyLabOptions,
  StrategyLabInputError,
} from "../application/strategyLabInput.js";
import type { StrategyLabRunRequest } from "../application/runStrategyLab.js";
import type { StrategyLabExperiment } from "../lab/strategyLab.js";
import { ApiError } from "./http.js";

export {
  MAX_ESTIMATED_LAB_WORK_UNITS,
  estimateStrategyLabWorkUnits,
  validateStrategyLabExecution,
} from "../application/runStrategyLab.js";

export const STRATEGY_LAB_TIMEOUT_MS = 60_000;

export type ParsedStrategyLabOptions = StrategyLabRunRequest;

function mapInputError(error: unknown): never {
  if (error instanceof StrategyLabInputError) {
    throw new ApiError(400, error.code, error.message);
  }
  throw error;
}

export function parseStrategyLabExperiment(value: unknown): StrategyLabExperiment {
  try {
    return parseApplicationStrategyLabExperiment(value);
  } catch (error) {
    return mapInputError(error);
  }
}

export function parseStrategyLabOptions(
  values: Record<string, unknown>,
  lottery: LotteryId,
): ParsedStrategyLabOptions {
  try {
    return parseApplicationStrategyLabOptions(values, lottery);
  } catch (error) {
    return mapInputError(error);
  }
}
