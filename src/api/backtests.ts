import type { IncomingMessage, ServerResponse } from "node:http";
import type { BacktestCatalogUseCase } from "../application/backtestCatalog.js";
import {
  BacktestExecutionBusyError,
  type ExecuteBacktestUseCase,
} from "../application/executeBacktest.js";
import { BacktestRoundLimitError } from "../application/runBacktest.js";
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
import { enforceRateLimit, FixedWindowRateLimiter } from "./rateLimit.js";
import { AnalysisCancelledError, AnalysisTimeoutError } from "./workerClient.js";

export interface BacktestApiOptions {
  corsOrigin?: string;
}

const backtestLimiter = new FixedWindowRateLimiter({ limit: 4, windowMs: 10 * 60_000 });

function parseLimit(value: string | null): number {
  return parsePositiveInt(value, "limit", { min: 1, max: 200, defaultValue: 20 });
}

function parseFixedCount(value: unknown): 8 | 9 | 10 {
  const parsed = parsePositiveInt(value, "fixedCount", { min: 8, max: 10, defaultValue: 8 });
  if (parsed !== 8 && parsed !== 9 && parsed !== 10) {
    throw new ApiError(400, "INVALID_ARGUMENT", "fixedCount must be 8, 9 or 10");
  }
  return parsed;
}

export async function serveBacktests(
  request: IncomingMessage,
  response: ServerResponse,
  options: BacktestApiOptions,
  catalog: BacktestCatalogUseCase,
  executeBacktest: ExecuteBacktestUseCase,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  const runMatch = /^\/api\/v1\/backtest-runs\/(\d+)$/.exec(pathname);
  const listMatch = /^\/api\/v1\/backtests\/([^/]+)$/.exec(pathname);
  if (!runMatch && !listMatch) return false;

  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:5173";

  try {
    if (method === "OPTIONS") {
      sendNoContent(response, corsOrigin);
      return true;
    }

    if (method === "POST" && listMatch?.[1] === "run") {
      if (!enforceRateLimit(request, response, backtestLimiter, "backtest")) return true;
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
      const controller = new AbortController();
      const abortWorker = () => controller.abort();
      request.once("aborted", abortWorker);
      response.once("close", abortWorker);

      try {
        const result = await executeBacktest.execute({
          lottery,
          gameCount,
          warmupContests,
          ...(fixedCount !== undefined ? { fixedCount } : {}),
          ...(startContest !== undefined ? { startContest } : {}),
          ...(endContest !== undefined ? { endContest } : {}),
          persist,
        }, controller.signal);
        if (response.destroyed || response.writableEnded) return true;
        sendJson(response, persist ? 201 : 200, result, corsOrigin);
        return true;
      } catch (error) {
        if (error instanceof AnalysisTimeoutError) {
          throw new ApiError(504, "ANALYSIS_TIMEOUT", "Backtest exceeded the safe execution limit");
        }
        if (error instanceof AnalysisCancelledError && (request.destroyed || response.destroyed)) return true;
        throw error;
      } finally {
        request.off("aborted", abortWorker);
        response.off("close", abortWorker);
      }
    }

    if (method === "GET" && runMatch) {
      const id = parsePositiveInt(runMatch[1], "backtestRunId");
      const run = await catalog.get(id);
      if (!run) throw new ApiError(404, "BACKTEST_NOT_FOUND", `Backtest run ${id} was not found`);
      sendJson(response, 200, run, corsOrigin);
      return true;
    }

    if (method === "GET" && listMatch && listMatch[1] !== "run") {
      const lottery = parseLottery(listMatch[1]);
      const items = await catalog.list(lottery, parseLimit(url.searchParams.get("limit")));
      sendJson(response, 200, { items }, corsOrigin);
      return true;
    }

    throw new ApiError(404, "ROUTE_NOT_FOUND", `${method} ${pathname} was not found`);
  } catch (error) {
    if (error instanceof ApiError) {
      sendJson(response, error.statusCode, { error: { code: error.code, message: error.message } }, corsOrigin);
      return true;
    }
    if (error instanceof BacktestExecutionBusyError) {
      sendJson(response, 429, { error: { code: error.code, message: error.message } }, corsOrigin);
      return true;
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
      return true;
    }
    throw error;
  }
}
