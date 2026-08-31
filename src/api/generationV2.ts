import type { IncomingMessage, ServerResponse } from "node:http";
import {
  GenerationV2Error,
  type GenerationV2UseCase,
} from "../application/generationV2.js";
import { InsufficientGenerationHistoryError } from "../application/generateGames.js";
import type { LotteryId } from "../domain/types.js";
import type { GenerationConstraints } from "../generator/planning.js";
import { LOTTERY_CONFIGS } from "../lotteries/config.js";
import type { ApiServerOptions } from "./app.js";
import { optionalString, parseGenerationMode } from "./generationInput.js";
import { generationLimiter, generationPlanLimiter } from "./generationRateLimit.js";
import {
  ApiError,
  isRecord,
  parseLottery,
  parseOptionalPositiveInt,
  parsePositiveInt,
  readJsonBody,
  sendJson,
  sendNoContent,
} from "./http.js";
import { enforceRateLimit } from "./rateLimit.js";

const GENERATION_V2_PATHS = new Set([
  "/api/v1/generation/plan",
  "/api/v1/generation/preview",
  "/api/v1/generation/save",
]);

function parseV2FixedCount(lottery: LotteryId, value: unknown): number {
  const allowed = lottery === "lotofacil" ? [8, 9, 10] : [0, 2, 3];
  const defaultValue = lottery === "lotofacil" ? 8 : 3;
  if (value === undefined || value === null || value === "") return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || !allowed.includes(parsed)) {
    throw new ApiError(400, "INVALID_ARGUMENT", `fixedCount must be one of ${allowed.join(", ")}`);
  }
  return parsed;
}

function parseNumberArray(value: unknown, field: string, lottery: LotteryId): number[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ApiError(400, "INVALID_ARGUMENT", `${field} must be an array`);
  const config = LOTTERY_CONFIGS[lottery];
  const parsed = value.map((item) => {
    const number = Number(item);
    if (!Number.isInteger(number) || number < config.minNumber || number > config.maxNumber) {
      throw new ApiError(
        400,
        "INVALID_ARGUMENT",
        `${field} must contain integers between ${config.minNumber} and ${config.maxNumber}`,
      );
    }
    return number;
  });
  if (new Set(parsed).size !== parsed.length) {
    throw new ApiError(400, "INVALID_ARGUMENT", `${field} must not contain duplicates`);
  }
  return parsed.sort((a, b) => a - b);
}

function parseIntegerRange(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): { min: number; max: number } | undefined {
  if (value === undefined || value === null || value === false) return undefined;
  if (!isRecord(value)) {
    throw new ApiError(400, "INVALID_ARGUMENT", `${field} must be an object with min and max`);
  }
  const min = Number(value.min);
  const max = Number(value.max);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < minimum || max > maximum || min > max) {
    throw new ApiError(
      400,
      "INVALID_ARGUMENT",
      `${field} must be an integer range between ${minimum} and ${maximum}`,
    );
  }
  return { min, max };
}

function parseGenerationConstraints(value: unknown, lottery: LotteryId): GenerationConstraints | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw new ApiError(400, "INVALID_ARGUMENT", "constraints must be an object");
  const config = LOTTERY_CONFIGS[lottery];
  const minimumSum = Array.from({ length: config.drawSize }, (_, index) => config.minNumber + index)
    .reduce((total, number) => total + number, 0);
  const maximumSum = Array.from({ length: config.drawSize }, (_, index) => config.maxNumber - index)
    .reduce((total, number) => total + number, 0);
  const odd = parseIntegerRange(value.odd, "constraints.odd", 0, config.drawSize);
  const repeated = parseIntegerRange(value.repeated, "constraints.repeated", 0, config.drawSize);
  const sum = parseIntegerRange(value.sum, "constraints.sum", minimumSum, maximumSum);
  if (!odd && !repeated && !sum) return undefined;
  return {
    ...(odd ? { odd } : {}),
    ...(repeated ? { repeated } : {}),
    ...(sum ? { sum } : {}),
  };
}

function parseV2Selection(body: Record<string, unknown>, lottery: LotteryId) {
  const fixedNumbers = parseNumberArray(body.fixedNumbers, "fixedNumbers", lottery);
  const excludedNumbers = parseNumberArray(body.excludedNumbers, "excludedNumbers", lottery);
  if (fixedNumbers.some((number) => excludedNumbers.includes(number))) {
    throw new ApiError(400, "INVALID_ARGUMENT", "A number cannot be fixed and excluded at the same time");
  }
  const constraints = parseGenerationConstraints(body.constraints, lottery);
  return { fixedNumbers, excludedNumbers, ...(constraints ? { constraints } : {}) };
}

function statusForGenerationV2Error(error: GenerationV2Error): number {
  switch (error.code) {
    case "GENERATION_PLAN_BUSY":
      return 429;
    case "GENERATION_PLAN_TIMEOUT":
      return 503;
    case "PREVIEW_EXPIRED":
    case "PREVIEW_CONFIG_CHANGED":
    case "PREVIEW_STALE":
      return 409;
    case "REPEAT_REFERENCE_UNAVAILABLE":
    case "NO_VALID_COMBINATIONS":
    case "ALGORITHM_SPACE_EMPTY":
    case "ALGORITHM_SPACE_UNSATISFIED":
      return 422;
    default:
      return 400;
  }
}

export async function serveGenerationV2(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
  generationV2: GenerationV2UseCase,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  if (!GENERATION_V2_PATHS.has(pathname)) return false;

  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:5173";

  try {
    if (method === "OPTIONS") {
      sendNoContent(response, corsOrigin);
      return true;
    }
    if (method !== "POST") {
      throw new ApiError(404, "ROUTE_NOT_FOUND", `${method} ${pathname} was not found`);
    }

    if (pathname === "/api/v1/generation/plan") {
      if (!enforceRateLimit(request, response, generationPlanLimiter, "generation-plan")) return true;
      const body = await readJsonBody(request);
      const lottery = parseLottery(body.lottery);
      const targetContestNumber = parseOptionalPositiveInt(body.targetContestNumber, "targetContestNumber");
      const selection = parseV2Selection(body, lottery);
      const plan = await generationV2.plan({
        lottery,
        ...(targetContestNumber !== undefined ? { targetContestNumber } : {}),
        ...selection,
      });
      sendJson(response, 200, plan, corsOrigin);
      return true;
    }

    if (!enforceRateLimit(request, response, generationLimiter, "generator-v2")) return true;
    const body = await readJsonBody(request);
    const lottery = parseLottery(body.lottery);
    const defaultGameCount = lottery === "mega-sena" ? 2 : 4;
    const gameCount = parsePositiveInt(body.gameCount, "gameCount", {
      min: 1,
      max: 10,
      defaultValue: defaultGameCount,
    });
    const fixedCount = parseV2FixedCount(lottery, body.fixedCount);
    const targetContestNumber = parseOptionalPositiveInt(body.targetContestNumber, "targetContestNumber");
    const generationMode = parseGenerationMode(body.generationMode);
    const seed = optionalString(body.seed, "seed", 160);
    const selection = parseV2Selection(body, lottery);
    const persist = pathname === "/api/v1/generation/save";
    if (persist && generationMode === "diversified" && !seed) {
      throw new ApiError(
        400,
        "SEED_REQUIRED",
        "Salvar uma prévia diversificada exige a seed retornada pela geração anterior",
      );
    }

    const result = await generationV2.execute({
      lottery,
      gameCount,
      fixedCount,
      ...(targetContestNumber !== undefined ? { targetContestNumber } : {}),
      generationMode,
      ...(seed !== undefined ? { seed } : {}),
      ...selection,
      persist,
    });
    sendJson(response, persist ? 201 : 200, result, corsOrigin);
    return true;
  } catch (error) {
    if (error instanceof ApiError) {
      sendJson(response, error.statusCode, {
        error: { code: error.code, message: error.message },
      }, corsOrigin);
      return true;
    }
    if (error instanceof GenerationV2Error) {
      sendJson(response, statusForGenerationV2Error(error), {
        error: { code: error.code, message: error.message },
      }, corsOrigin);
      return true;
    }
    if (error instanceof InsufficientGenerationHistoryError) {
      sendJson(response, 409, {
        error: {
          code: "INSUFFICIENT_HISTORY",
          message: error.message,
          available: error.available,
          required: error.required,
        },
      }, corsOrigin);
      return true;
    }

    console.error("Loto Lab Generator 2.0 request failed", error);
    sendJson(response, 500, {
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
    }, corsOrigin);
    return true;
  }
}
