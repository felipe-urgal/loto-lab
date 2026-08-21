import { createServer, type RequestListener, type Server } from "node:http";
import type { Pool } from "pg";
import { LOTTERY_CONFIGS } from "../lotteries/config.js";
import type { GenerationMode } from "../generator/shared.js";
import {
  BacktestRoundLimitError,
  InsufficientGenerationHistoryError,
  LotoLabApiServices,
} from "./services.js";
import {
  ApiError,
  isRecord,
  parseBoolean,
  parseLottery,
  parseOptionalPositiveInt,
  parsePositiveInt,
  readJsonBody,
  sendJson,
  sendNoContent,
} from "./http.js";
import { enforceRateLimit, FixedWindowRateLimiter } from "./rateLimit.js";
import { expensiveAnalysisGate } from "./workGate.js";
import { runBacktestInWorker } from "./workerClient.js";

export interface ApiServerOptions {
  pool: Pool;
  corsOrigin?: string;
}

const generationLimiter = new FixedWindowRateLimiter({ limit: 30, windowMs: 60_000 });
const backtestLimiter = new FixedWindowRateLimiter({ limit: 4, windowMs: 10 * 60_000 });

function requiredString(value: unknown, field: string, maxLength = 160): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new ApiError(400, "INVALID_ARGUMENT", `${field} must be a non-empty string up to ${maxLength} characters`);
  }
  return value.trim();
}

function optionalString(value: unknown, field: string, maxLength = 160): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredString(value, field, maxLength);
}

function parseGenerationMode(value: unknown): GenerationMode {
  if (value === undefined || value === null || value === "") return "diversified";
  if (value !== "deterministic" && value !== "diversified") {
    throw new ApiError(400, "INVALID_ARGUMENT", "generationMode must be deterministic or diversified");
  }
  return value;
}

function parseFixedCount(value: unknown): 8 | 9 | 10 {
  const parsed = parsePositiveInt(value, "fixedCount", { min: 8, max: 10, defaultValue: 8 });
  if (parsed !== 8 && parsed !== 9 && parsed !== 10) {
    throw new ApiError(400, "INVALID_ARGUMENT", "fixedCount must be 8, 9 or 10");
  }
  return parsed;
}

function parseLimit(value: string | null, defaultValue = 20): number {
  return parsePositiveInt(value, "limit", { min: 1, max: 200, defaultValue });
}

function pathMatch(pathname: string, pattern: RegExp): RegExpExecArray | undefined {
  return pattern.exec(pathname) ?? undefined;
}

export function createApiRequestHandler(options: ApiServerOptions): RequestListener {
  const services = new LotoLabApiServices(options.pool);
  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:5173";

  return async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://localhost");
      const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;

      if (method === "OPTIONS") {
        sendNoContent(response, corsOrigin);
        return;
      }

      if (method === "GET" && pathname === "/") {
        sendJson(response, 200, {
          name: "Loto Lab API",
          version: "v1",
          health: "/health/ready",
          basePath: "/api/v1",
        }, corsOrigin);
        return;
      }

      if (method === "GET" && pathname === "/health/live") {
        sendJson(response, 200, { status: "ok" }, corsOrigin);
        return;
      }

      if (method === "GET" && (pathname === "/health" || pathname === "/health/ready")) {
        await options.pool.query("SELECT 1");
        sendJson(response, 200, { status: "ok", database: "ready" }, corsOrigin);
        return;
      }

      if (method === "GET" && pathname === "/api/v1/lotteries") {
        sendJson(response, 200, { items: Object.values(LOTTERY_CONFIGS) }, corsOrigin);
        return;
      }

      let match = pathMatch(pathname, /^\/api\/v1\/contests\/([^/]+)\/latest$/);
      if (method === "GET" && match) {
        const lottery = parseLottery(match[1]);
        const contests = await services.contests.list({ lottery, order: "desc", limit: 1 });
        const contest = contests[0];
        if (!contest) throw new ApiError(404, "CONTEST_NOT_FOUND", `No contest stored for ${lottery}`);
        sendJson(response, 200, contest, corsOrigin);
        return;
      }

      match = pathMatch(pathname, /^\/api\/v1\/contests\/([^/]+)\/(\d+)$/);
      if (method === "GET" && match) {
        const lottery = parseLottery(match[1]);
        const contestNumber = parsePositiveInt(match[2], "contestNumber");
        const contest = await services.contests.findByNumber(lottery, contestNumber);
        if (!contest) throw new ApiError(404, "CONTEST_NOT_FOUND", `Contest ${contestNumber} was not found for ${lottery}`);
        sendJson(response, 200, contest, corsOrigin);
        return;
      }

      match = pathMatch(pathname, /^\/api\/v1\/contests\/([^/]+)$/);
      if (method === "GET" && match) {
        const lottery = parseLottery(match[1]);
        const startContest = parseOptionalPositiveInt(url.searchParams.get("startContest"), "startContest");
        const endContest = parseOptionalPositiveInt(url.searchParams.get("endContest"), "endContest");
        const orderParam = url.searchParams.get("order") ?? "desc";
        if (orderParam !== "asc" && orderParam !== "desc") {
          throw new ApiError(400, "INVALID_ARGUMENT", "order must be asc or desc");
        }
        if (startContest !== undefined && endContest !== undefined && startContest > endContest) {
          throw new ApiError(400, "INVALID_ARGUMENT", "startContest must be less than or equal to endContest");
        }
        const items = await services.contests.list({
          lottery,
          ...(startContest !== undefined ? { startContest } : {}),
          ...(endContest !== undefined ? { endContest } : {}),
          order: orderParam,
          limit: parseLimit(url.searchParams.get("limit"), 20),
        });
        sendJson(response, 200, { items }, corsOrigin);
        return;
      }

      match = pathMatch(pathname, /^\/api\/v1\/analysis\/([^/]+)\/advanced$/);
      if (method === "GET" && match) {
        const lottery = parseLottery(match[1]);
        sendJson(response, 200, await services.analyzeAdvanced(lottery), corsOrigin);
        return;
      }

      match = pathMatch(pathname, /^\/api\/v1\/analysis\/([^/]+)$/);
      if (method === "GET" && match) {
        const lottery = parseLottery(match[1]);
        sendJson(response, 200, await services.analyze(lottery), corsOrigin);
        return;
      }

      if (method === "POST" && pathname === "/api/v1/games/generate") {
        if (!enforceRateLimit(request, response, generationLimiter, "generate-games")) return;
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
        const result = await services.generate({
          lottery,
          gameCount,
          ...(fixedCount !== undefined ? { fixedCount } : {}),
          ...(targetContestNumber !== undefined ? { targetContestNumber } : {}),
          generationMode,
          ...(seed !== undefined ? { seed } : {}),
          persist,
        });
        sendJson(response, persist ? 201 : 200, result, corsOrigin);
        return;
      }

      match = pathMatch(pathname, /^\/api\/v1\/game-batches\/id\/(\d+)$/);
      if (method === "GET" && match) {
        const id = parsePositiveInt(match[1], "batchId");
        const batch = await services.games.findBatch(id);
        if (!batch) throw new ApiError(404, "BATCH_NOT_FOUND", `Game batch ${id} was not found`);
        sendJson(response, 200, batch, corsOrigin);
        return;
      }

      match = pathMatch(pathname, /^\/api\/v1\/game-batches\/([^/]+)$/);
      if (method === "GET" && match) {
        const lottery = parseLottery(match[1]);
        const items = await services.games.listRecent(lottery, parseLimit(url.searchParams.get("limit"), 20));
        sendJson(response, 200, { items }, corsOrigin);
        return;
      }

      if (method === "POST" && pathname === "/api/v1/games/check") {
        const body = await readJsonBody(request);
        const batchId = parsePositiveInt(body.batchId, "batchId");
        const contestNumber = parsePositiveInt(body.contestNumber, "contestNumber");
        const result = await services.checkBatch(batchId, contestNumber);
        if (!result) throw new ApiError(404, "BATCH_NOT_FOUND", `Game batch ${batchId} was not found`);
        if (!result.target || !result.checks) {
          throw new ApiError(404, "CONTEST_NOT_FOUND", `Contest ${contestNumber} was not found for ${result.batch.lottery}`);
        }
        sendJson(response, 200, result, corsOrigin);
        return;
      }

      if (method === "GET" && pathname === "/api/v1/strategies") {
        const lotteryParam = url.searchParams.get("lottery");
        const lottery = lotteryParam === null ? undefined : parseLottery(lotteryParam);
        const items = await services.strategies.list(lottery);
        sendJson(response, 200, { items }, corsOrigin);
        return;
      }

      if (method === "POST" && pathname === "/api/v1/strategies") {
        const body = await readJsonBody(request);
        const slug = requiredString(body.slug, "slug", 100);
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
          throw new ApiError(400, "INVALID_ARGUMENT", "slug must contain lowercase letters, numbers and hyphens only");
        }
        const lottery = parseLottery(body.lottery);
        const name = requiredString(body.name, "name");
        const methodologyVersion = requiredString(body.methodologyVersion, "methodologyVersion", 80);
        if (body.config !== undefined && !isRecord(body.config)) {
          throw new ApiError(400, "INVALID_ARGUMENT", "config must be a JSON object");
        }
        const strategy = await services.upsertStrategy({
          slug,
          lottery,
          name,
          methodologyVersion,
          config: body.config ?? {},
        });
        sendJson(response, 201, strategy, corsOrigin);
        return;
      }

      if (method === "POST" && pathname === "/api/v1/backtests/run") {
        if (!enforceRateLimit(request, response, backtestLimiter, "backtest")) return;
        const body = await readJsonBody(request);
        const lottery = parseLottery(body.lottery);
        const defaultGameCount = lottery === "mega-sena" ? 2 : 4;
        const gameCount = parsePositiveInt(body.gameCount, "gameCount", {
          min: 1,
          max: 10,
          defaultValue: defaultGameCount,
        });
        const warmupContests = parsePositiveInt(body.warmupContests, "warmupContests", {
          min: 1,
          max: 500,
          defaultValue: 20,
        });
        const startContest = parseOptionalPositiveInt(body.startContest, "startContest");
        const endContest = parseOptionalPositiveInt(body.endContest, "endContest");
        if (startContest !== undefined && endContest !== undefined && startContest > endContest) {
          throw new ApiError(400, "INVALID_ARGUMENT", "startContest must be less than or equal to endContest");
        }
        const persist = parseBoolean(body.persist, "persist", true);
        const fixedCount = lottery === "lotofacil" ? parseFixedCount(body.fixedCount) : undefined;
        const release = expensiveAnalysisGate.acquire();
        if (!release) {
          throw new ApiError(429, "ANALYSIS_BUSY", "Another backtest or Strategy Lab analysis is already running");
        }
        try {
          const result = await runBacktestInWorker(services, {
            lottery,
            gameCount,
            warmupContests,
            ...(fixedCount !== undefined ? { fixedCount } : {}),
            ...(startContest !== undefined ? { startContest } : {}),
            ...(endContest !== undefined ? { endContest } : {}),
            persist,
          });
          sendJson(response, persist ? 201 : 200, result, corsOrigin);
          return;
        } finally {
          release();
        }
      }

      match = pathMatch(pathname, /^\/api\/v1\/backtest-runs\/(\d+)$/);
      if (method === "GET" && match) {
        const id = parsePositiveInt(match[1], "backtestRunId");
        const run = await services.backtests.findById(id);
        if (!run) throw new ApiError(404, "BACKTEST_NOT_FOUND", `Backtest run ${id} was not found`);
        sendJson(response, 200, run, corsOrigin);
        return;
      }

      match = pathMatch(pathname, /^\/api\/v1\/backtests\/([^/]+)$/);
      if (method === "GET" && match) {
        const lottery = parseLottery(match[1]);
        const items = await services.listBacktests(lottery, parseLimit(url.searchParams.get("limit"), 20));
        sendJson(response, 200, { items }, corsOrigin);
        return;
      }

      throw new ApiError(404, "ROUTE_NOT_FOUND", `${method} ${pathname} was not found`);
    } catch (error) {
      if (error instanceof ApiError) {
        sendJson(response, error.statusCode, {
          error: { code: error.code, message: error.message },
        }, corsOrigin);
        return;
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
        return;
      }
      if (error instanceof BacktestRoundLimitError) {
        sendJson(response, 422, {
          error: {
            code: "BACKTEST_LIMIT_EXCEEDED",
            message: error.message,
            requested: error.requested,
            maximum: error.maximum,
          },
        }, corsOrigin);
        return;
      }

      console.error("Loto Lab API request failed", error);
      sendJson(response, 500, {
        error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
      }, corsOrigin);
    }
  };
}

export function createApiServer(options: ApiServerOptions): Server {
  return createServer(createApiRequestHandler(options));
}
