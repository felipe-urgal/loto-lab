import type { IncomingMessage, ServerResponse } from "node:http";
import { eligibleTargetIndexes } from "../analysis/contestEligibility.js";
import type {
  StrategyLabExperiment,
  StrategyLabOptions,
} from "../lab/strategyLab.js";
import { resolveStrategyLabPeriod } from "../lab/strategyLab.js";
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
import { AnalysisCancelledError, runStrategyLabInWorker } from "./workerClient.js";

const labLimiter = new FixedWindowRateLimiter({ limit: 4, windowMs: 10 * 60_000 });
const STRATEGY_LAB_TIMEOUT_MS = 60_000;
const MAX_ESTIMATED_LAB_WORK_UNITS = 750_000;

function parseExperiment(value: unknown): StrategyLabExperiment {
  if (value === undefined || value === null || value === "") return "fixed-core";
  if (value === "fixed-core" || value === "external-rules" || value === "score-model") return value;
  throw new ApiError(400, "INVALID_ARGUMENT", "experiment must be fixed-core, external-rules or score-model");
}

export function estimateStrategyLabWorkUnits(
  experiment: StrategyLabExperiment,
  eligibleTargets: number,
  gameCount: number,
  randomSamples: number,
): number {
  const strategyVariants = experiment === "external-rules" ? 9 : 3;
  const backtestUnits = eligibleTargets * gameCount * (randomSamples + strategyVariants + 2);
  // Score-model also computes three ranking-quality series plus walk-forward
  // profile selection. These are cheaper than full ticket generation, but not free.
  const scoreAnalysisUnits = experiment === "score-model" ? eligibleTargets * 40 : 0;
  return backtestUnits + scoreAnalysisUnits;
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
    const randomSamples = parsePositiveInt(body.randomSamples, "randomSamples", {
      min: 10,
      max: 500,
      defaultValue: 100,
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

    const workerInput: StrategyLabOptions = {
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
    const period = resolveStrategyLabPeriod(contests, workerInput);
    const scoped = contests
      .filter((contest) => contest.lottery === lottery)
      .sort((a, b) => a.number - b.number);
    const eligibleTargets = eligibleTargetIndexes(scoped, {
      warmupContests,
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
      experiment,
      eligibleTargets,
      gameCount,
      randomSamples,
    );
    if (estimatedWorkUnits > MAX_ESTIMATED_LAB_WORK_UNITS) {
      throw new ApiError(
        400,
        "ANALYSIS_TOO_LARGE",
        "Requested Strategy Lab run is too large. Reduce the effective contest period, games per contest, or random controls.",
      );
    }

    const release = expensiveAnalysisGate.acquire();
    if (!release) {
      throw new ApiError(429, "ANALYSIS_BUSY", "Another backtest or Strategy Lab analysis is already running");
    }

    try {
      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, STRATEGY_LAB_TIMEOUT_MS);
      timeout.unref?.();
      const abortWorker = () => controller.abort();
      request.once("aborted", abortWorker);
      response.once("close", abortWorker);

      try {
        const result = await runStrategyLabInWorker(contests, workerInput, controller.signal);
        if (response.destroyed || response.writableEnded) return true;
        sendJson(response, 200, result, corsOrigin);
        return true;
      } catch (error) {
        if (error instanceof AnalysisCancelledError) {
          if (timedOut) {
            throw new ApiError(504, "ANALYSIS_TIMEOUT", "Strategy Lab exceeded the 60 second execution limit");
          }
          if (request.destroyed || response.destroyed) return true;
        }
        throw error;
      } finally {
        clearTimeout(timeout);
        request.off("aborted", abortWorker);
        response.off("close", abortWorker);
      }
    } finally {
      release();
    }
  } catch (error) {
    if (error instanceof ApiError) {
      if (!response.destroyed && !response.writableEnded) {
        sendJson(response, error.statusCode, {
          error: { code: error.code, message: error.message },
        }, corsOrigin);
      }
      return true;
    }
    throw error;
  }
}
