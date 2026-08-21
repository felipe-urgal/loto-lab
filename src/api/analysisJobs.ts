import type { IncomingMessage, ServerResponse } from "node:http";
import { getAnalysisJobManager } from "../analysis/jobManager.js";
import type { StrategyLabExperiment } from "../lab/strategyLab.js";
import { PostgresStrategyRepository } from "../persistence/strategyRepository.js";
import type { StrategyVersionRecord } from "../persistence/types.js";
import type { ApiServerOptions } from "./app.js";
import {
  ApiError,
  parseLottery,
  parseOptionalPositiveInt,
  parsePositiveInt,
  readJsonBody,
  sendJson,
  sendNoContent,
} from "./http.js";
import { enforceRateLimit, FixedWindowRateLimiter } from "./rateLimit.js";

const jobLimiter = new FixedWindowRateLimiter({ limit: 12, windowMs: 10 * 60_000 });

function value(body: Record<string, unknown>, config: Record<string, unknown>, key: string): unknown {
  return body[key] ?? config[key];
}

function parseKind(value: unknown): "backtest" | "strategy-lab" {
  if (value === "backtest" || value === "strategy-lab") return value;
  throw new ApiError(400, "INVALID_ARGUMENT", "kind must be backtest or strategy-lab");
}

function parseExperiment(value: unknown): StrategyLabExperiment {
  if (value === undefined || value === null || value === "") return "fixed-core";
  if (value === "fixed-core" || value === "external-rules") return value;
  throw new ApiError(400, "INVALID_ARGUMENT", "experiment must be fixed-core or external-rules");
}

function parseFixedCount(value: unknown): 8 | 9 | 10 {
  const fixed = parsePositiveInt(value, "fixedCount", { min: 8, max: 10, defaultValue: 8 });
  if (fixed !== 8 && fixed !== 9 && fixed !== 10) {
    throw new ApiError(400, "INVALID_ARGUMENT", "fixedCount must be 8, 9 or 10");
  }
  return fixed;
}

async function strategyVersion(
  options: ApiServerOptions,
  body: Record<string, unknown>,
  lottery: ReturnType<typeof parseLottery>,
): Promise<{ version?: StrategyVersionRecord; strategyId?: number }> {
  if (body.strategyVersionId === undefined || body.strategyVersionId === null || body.strategyVersionId === "") return {};
  const id = parsePositiveInt(body.strategyVersionId, "strategyVersionId");
  const repository = new PostgresStrategyRepository(options.pool);
  const version = await repository.findVersionById(id);
  if (!version) throw new ApiError(404, "STRATEGY_VERSION_NOT_FOUND", `Strategy version ${id} was not found`);
  const strategy = await repository.findById(version.strategyId);
  if (!strategy) throw new ApiError(404, "STRATEGY_NOT_FOUND", `Strategy ${version.strategyId} was not found`);
  if (strategy.lottery !== lottery) {
    throw new ApiError(409, "STRATEGY_LOTTERY_MISMATCH", `Strategy version ${id} belongs to ${strategy.lottery}`);
  }
  return { version, strategyId: strategy.id };
}

function validateRange(startContest: number | undefined, endContest: number | undefined): void {
  if (startContest !== undefined && endContest !== undefined && startContest > endContest) {
    throw new ApiError(400, "INVALID_ARGUMENT", "startContest must be less than or equal to endContest");
  }
}

export async function serveAnalysisJobs(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  if (pathname !== "/api/v1/analysis-jobs" && !pathname.startsWith("/api/v1/analysis-jobs/")) return false;

  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:3000";
  const manager = getAnalysisJobManager(options.pool);

  try {
    if (method === "OPTIONS") {
      sendNoContent(response, corsOrigin);
      return true;
    }

    if (method === "GET" && pathname === "/api/v1/analysis-jobs") {
      const lotteryParam = url.searchParams.get("lottery");
      const lottery = lotteryParam === null ? undefined : parseLottery(lotteryParam);
      const limit = parsePositiveInt(url.searchParams.get("limit"), "limit", { min: 1, max: 200, defaultValue: 50 });
      sendJson(response, 200, { items: await manager.list(limit, lottery) }, corsOrigin);
      return true;
    }

    if (method === "POST" && pathname === "/api/v1/analysis-jobs") {
      if (!enforceRateLimit(request, response, jobLimiter, "analysis-jobs")) return true;
      const body = await readJsonBody(request);
      const kind = parseKind(body.kind);
      const lottery = parseLottery(body.lottery);
      const strategy = await strategyVersion(options, body, lottery);
      const config = strategy.version?.config ?? {};
      const gameCount = parsePositiveInt(value(body, config, "gameCount"), "gameCount", {
        min: 1,
        max: 20,
        defaultValue: lottery === "mega-sena" ? 2 : 4,
      });
      const warmupContests = parsePositiveInt(value(body, config, "warmupContests"), "warmupContests", {
        min: 1,
        max: 2000,
        defaultValue: 20,
      });
      const startContest = parseOptionalPositiveInt(value(body, config, "startContest"), "startContest");
      const endContest = parseOptionalPositiveInt(value(body, config, "endContest"), "endContest");
      validateRange(startContest, endContest);

      let input: Record<string, unknown>;
      if (kind === "backtest") {
        input = {
          lottery,
          gameCount,
          warmupContests,
          persist: true,
          ...(lottery === "lotofacil" ? { fixedCount: parseFixedCount(value(body, config, "fixedCount")) } : {}),
          ...(startContest !== undefined ? { startContest } : {}),
          ...(endContest !== undefined ? { endContest } : {}),
          ...(strategy.strategyId !== undefined ? { strategyId: strategy.strategyId } : {}),
          ...(strategy.version ? { strategyVersionId: strategy.version.id } : {}),
        };
      } else {
        const experiment = parseExperiment(value(body, config, "experiment"));
        if (experiment === "external-rules" && lottery !== "mega-sena") {
          throw new ApiError(400, "INVALID_ARGUMENT", "external-rules experiment is available only for Mega-Sena");
        }
        input = {
          lottery,
          experiment,
          gameCount,
          warmupContests,
          lookbackContests: parsePositiveInt(value(body, config, "lookbackContests"), "lookbackContests", {
            min: 10,
            max: 2000,
            defaultValue: 200,
          }),
          bucketSize: parsePositiveInt(value(body, config, "bucketSize"), "bucketSize", {
            min: 5,
            max: 250,
            defaultValue: 25,
          }),
          ...(startContest !== undefined ? { startContest } : {}),
          ...(endContest !== undefined ? { endContest } : {}),
          ...(strategy.version ? { strategyVersionId: strategy.version.id } : {}),
        };
      }

      const job = await manager.enqueue(kind, lottery, input);
      sendJson(response, 202, job, corsOrigin);
      return true;
    }

    const cancelMatch = /^\/api\/v1\/analysis-jobs\/(\d+)\/cancel$/.exec(pathname);
    if (method === "POST" && cancelMatch) {
      const id = parsePositiveInt(cancelMatch[1], "analysisJobId");
      const job = await manager.cancel(id);
      if (!job) throw new ApiError(404, "ANALYSIS_JOB_NOT_FOUND", `Analysis job ${id} was not found`);
      sendJson(response, 200, job, corsOrigin);
      return true;
    }

    const getMatch = /^\/api\/v1\/analysis-jobs\/(\d+)$/.exec(pathname);
    if (method === "GET" && getMatch) {
      const id = parsePositiveInt(getMatch[1], "analysisJobId");
      const job = await manager.findById(id);
      if (!job) throw new ApiError(404, "ANALYSIS_JOB_NOT_FOUND", `Analysis job ${id} was not found`);
      sendJson(response, 200, job, corsOrigin);
      return true;
    }

    throw new ApiError(404, "ROUTE_NOT_FOUND", `${method} ${pathname} was not found`);
  } catch (error) {
    if (error instanceof ApiError) {
      sendJson(response, error.statusCode, { error: { code: error.code, message: error.message } }, corsOrigin);
      return true;
    }
    throw error;
  }
}
