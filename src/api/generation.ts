import type { IncomingMessage, ServerResponse } from "node:http";
import {
  InsufficientGenerationHistoryError,
  type GenerateGamesUseCase,
} from "../application/generateGames.js";
import type { ApiServerOptions } from "./app.js";
import { optionalString, parseGenerationMode } from "./generationInput.js";
import { generationLimiter } from "./generationRateLimit.js";
import {
  ApiError,
  parseBoolean,
  parseLottery,
  parseOptionalPositiveInt,
  parsePositiveInt,
  readJsonBody,
  sendJson,
  sendNoContent,
} from "./http.js";
import { enforceRateLimit } from "./rateLimit.js";

function parseFixedCount(value: unknown): 8 | 9 | 10 {
  const parsed = parsePositiveInt(value, "fixedCount", { min: 8, max: 10, defaultValue: 8 });
  if (parsed !== 8 && parsed !== 9 && parsed !== 10) {
    throw new ApiError(400, "INVALID_ARGUMENT", "fixedCount must be 8, 9 or 10");
  }
  return parsed;
}

export async function serveGeneration(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
  generateGames: GenerateGamesUseCase,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  if (pathname !== "/api/v1/games/generate") return false;

  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:5173";

  try {
    if (method === "OPTIONS") {
      sendNoContent(response, corsOrigin);
      return true;
    }

    if (method !== "POST") {
      throw new ApiError(404, "ROUTE_NOT_FOUND", `${method} ${pathname} was not found`);
    }
    if (!enforceRateLimit(request, response, generationLimiter, "generate-games")) return true;

    const body = await readJsonBody(request);
    const lottery = parseLottery(body.lottery);
    const defaultGameCount = lottery === "mega-sena" ? 2 : 4;
    const gameCount = parsePositiveInt(body.gameCount, "gameCount", {
      min: 1,
      max: 10,
      defaultValue: defaultGameCount,
    });
    const targetContestNumber = parseOptionalPositiveInt(body.targetContestNumber, "targetContestNumber");
    const persist = parseBoolean(body.persist, "persist", true);
    const fixedCount = lottery === "lotofacil" ? parseFixedCount(body.fixedCount) : undefined;
    const generationMode = parseGenerationMode(body.generationMode);
    const seed = optionalString(body.seed, "seed", 160);
    const result = await generateGames.execute({
      lottery,
      gameCount,
      ...(fixedCount !== undefined ? { fixedCount } : {}),
      ...(targetContestNumber !== undefined ? { targetContestNumber } : {}),
      generationMode,
      ...(seed !== undefined ? { seed } : {}),
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

    console.error("Loto Lab generation request failed", error);
    sendJson(response, 500, {
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
    }, corsOrigin);
    return true;
  }
}
