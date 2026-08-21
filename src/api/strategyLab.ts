import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  StrategyLabExperiment,
  StrategyLabOptions,
} from "../lab/strategyLab.js";
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
import { enforceRateLimit, FixedWindowRateLimiter } from "./rateLimit.js";
import { expensiveAnalysisGate } from "./workGate.js";
import { runStrategyLabInWorker } from "./workerClient.js";

const labLimiter = new FixedWindowRateLimiter({ limit: 4, windowMs: 10 * 60_000 });

function parseExperiment(value: unknown): StrategyLabExperiment {
  if (value === undefined || value === null || value === "") return "fixed-core";
  if (value === "fixed-core" || value === "external-rules") return value;
  throw new ApiError(400, "INVALID_ARGUMENT", "experiment must be fixed-core or external-rules");
}

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
    if (!enforceRateLimit(request, response, labLimiter, "strategy-lab")) return true;
    const body = await readJsonBody(request);
    const lottery = parseLottery(body.lottery);
    const experiment = parseExperiment(body.experiment);
    if (experiment === "external-rules" && lottery !== "mega-sena") {
      throw new ApiError(400, "INVALID_ARGUMENT", "external-rules experiment is available only for Mega-Sena");
    }
    const gameCount = parsePositiveInt(body.gameCount, "gameCount", {
      min: 1,
      max: 10,
      defaultValue: lottery === "mega-sena" ? 2 : 4,
    });
    const warmupContests = parsePositiveInt(body.warmupContests, "warmupContests", {
      min: 1,
      max: 500,
      defaultValue: 20,
    });
    const lookbackContests = parsePositiveInt(body.lookbackContests, "lookbackContests", {
      min: 10,
      max: 500,
      defaultValue: 200,
    });
    const bucketSize = parsePositiveInt(body.bucketSize, "bucketSize", {
      min: 5,
      max: 100,
      defaultValue: 25,
    });
    const startContest = parseOptionalPositiveInt(body.startContest, "startContest");
    const endContest = parseOptionalPositiveInt(body.endContest, "endContest");

    if (startContest !== undefined && endContest !== undefined && startContest > endContest) {
      throw new ApiError(400, "INVALID_ARGUMENT", "startContest must be less than or equal to endContest");
    }

    const release = expensiveAnalysisGate.acquire();
    if (!release) {
      throw new ApiError(429, "ANALYSIS_BUSY", "Another backtest or Strategy Lab analysis is already running");
    }

    try {
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

      const workerInput: StrategyLabOptions = {
        lottery,
        experiment,
        gameCount,
        warmupContests,
        lookbackContests,
        bucketSize,
        ...(startContest !== undefined ? { startContest } : {}),
        ...(endContest !== undefined ? { endContest } : {}),
      };
      const result = await runStrategyLabInWorker(contests, workerInput);

      sendJson(response, 200, result, corsOrigin);
      return true;
    } finally {
      release();
    }
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
