import type { IncomingMessage, ServerResponse } from "node:http";
import { compareStrategyLab } from "../lab/strategyLab.js";
import { PostgresContestRepository } from "../persistence/contestRepository.js";
import type { ApiServerOptions } from "./app.js";
import {
  ApiError,
  parseLottery,
  parseOptionalPositiveInt,
  parsePositiveInt,
  readJsonBody,
  sendJson,
} from "./http.js";

export async function serveStrategyLab(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  if (method !== "POST" || url.pathname !== "/api/v1/lab/compare") return false;

  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:3000";

  try {
    const body = await readJsonBody(request);
    const lottery = parseLottery(body.lottery);
    const gameCount = parsePositiveInt(body.gameCount, "gameCount", {
      min: 1,
      max: 20,
      defaultValue: lottery === "mega-sena" ? 2 : 4,
    });
    const warmupContests = parsePositiveInt(body.warmupContests, "warmupContests", {
      min: 1,
      max: 5000,
      defaultValue: 20,
    });
    const lookbackContests = parsePositiveInt(body.lookbackContests, "lookbackContests", {
      min: 10,
      max: 5000,
      defaultValue: 200,
    });
    const bucketSize = parsePositiveInt(body.bucketSize, "bucketSize", {
      min: 5,
      max: 200,
      defaultValue: 25,
    });
    const startContest = parseOptionalPositiveInt(body.startContest, "startContest");
    const endContest = parseOptionalPositiveInt(body.endContest, "endContest");

    if (startContest !== undefined && endContest !== undefined && startContest > endContest) {
      throw new ApiError(400, "INVALID_ARGUMENT", "startContest must be less than or equal to endContest");
    }

    const contests = await new PostgresContestRepository(options.pool).list({
      lottery,
      order: "asc",
    });

    if (contests.length <= warmupContests) {
      throw new ApiError(
        409,
        "INSUFFICIENT_HISTORY",
        `At least ${warmupContests + 1} contests are required to compare strategies`,
      );
    }

    const result = compareStrategyLab(contests, {
      lottery,
      gameCount,
      warmupContests,
      lookbackContests,
      bucketSize,
      ...(startContest !== undefined ? { startContest } : {}),
      ...(endContest !== undefined ? { endContest } : {}),
    });

    sendJson(response, 200, result, corsOrigin);
    return true;
  } catch (error) {
    if (error instanceof ApiError) {
      sendJson(response, error.statusCode, {
        error: { code: error.code, message: error.message },
      }, corsOrigin);
      return true;
    }
    throw error;
  }
}
