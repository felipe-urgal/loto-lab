import type { IncomingMessage, ServerResponse } from "node:http";
import {
  AnalysisJobInputError,
  AnalysisJobNotFoundError,
  AnalysisJobStrategyLotteryMismatchError,
  AnalysisJobStrategyNotFoundError,
  AnalysisJobStrategyVersionNotFoundError,
  AnalysisJobTooLargeError,
  type AnalysisJobKind,
  type AnalysisJobsUseCase,
} from "../application/analysisJobs.js";
import type { ApiServerOptions } from "./app.js";
import {
  ApiError,
  parseLottery,
  parsePositiveInt,
  readJsonBody,
  sendJson,
  sendNoContent,
} from "./http.js";
import { enforceRateLimit, FixedWindowRateLimiter } from "./rateLimit.js";

const jobLimiter = new FixedWindowRateLimiter({ limit: 12, windowMs: 10 * 60_000 });

function parseKind(value: unknown): AnalysisJobKind {
  if (value === "backtest" || value === "strategy-lab") return value;
  throw new ApiError(400, "INVALID_ARGUMENT", "kind must be backtest or strategy-lab");
}

function mapAnalysisJobError(error: unknown): ApiError | undefined {
  if (error instanceof ApiError) return error;
  if (error instanceof AnalysisJobInputError || error instanceof AnalysisJobTooLargeError) {
    return new ApiError(400, error.code, error.message);
  }
  if (
    error instanceof AnalysisJobStrategyVersionNotFoundError
    || error instanceof AnalysisJobStrategyNotFoundError
    || error instanceof AnalysisJobNotFoundError
  ) {
    return new ApiError(404, error.code, error.message);
  }
  if (error instanceof AnalysisJobStrategyLotteryMismatchError) {
    return new ApiError(409, error.code, error.message);
  }
  return undefined;
}

export async function serveAnalysisJobs(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
  analysisJobs: AnalysisJobsUseCase,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  if (pathname !== "/api/v1/analysis-jobs" && !pathname.startsWith("/api/v1/analysis-jobs/")) return false;

  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:3000";

  try {
    if (method === "OPTIONS") {
      sendNoContent(response, corsOrigin);
      return true;
    }

    if (method === "GET" && pathname === "/api/v1/analysis-jobs") {
      const lotteryParam = url.searchParams.get("lottery");
      const lottery = lotteryParam === null ? undefined : parseLottery(lotteryParam);
      const limit = parsePositiveInt(url.searchParams.get("limit"), "limit", {
        min: 1,
        max: 200,
        defaultValue: 50,
      });
      sendJson(response, 200, { items: await analysisJobs.list(limit, lottery) }, corsOrigin);
      return true;
    }

    if (method === "POST" && pathname === "/api/v1/analysis-jobs") {
      if (!enforceRateLimit(request, response, jobLimiter, "analysis-jobs")) return true;
      const body = await readJsonBody(request);
      const kind = parseKind(body.kind);
      const lottery = parseLottery(body.lottery);
      const job = await analysisJobs.enqueue({ kind, lottery, values: body });
      sendJson(response, 202, job, corsOrigin);
      return true;
    }

    const cancelMatch = /^\/api\/v1\/analysis-jobs\/(\d+)\/cancel$/.exec(pathname);
    if (method === "POST" && cancelMatch) {
      const id = parsePositiveInt(cancelMatch[1], "analysisJobId");
      sendJson(response, 200, await analysisJobs.cancel(id), corsOrigin);
      return true;
    }

    const getMatch = /^\/api\/v1\/analysis-jobs\/(\d+)$/.exec(pathname);
    if (method === "GET" && getMatch) {
      const id = parsePositiveInt(getMatch[1], "analysisJobId");
      sendJson(response, 200, await analysisJobs.findById(id), corsOrigin);
      return true;
    }

    throw new ApiError(404, "ROUTE_NOT_FOUND", `${method} ${pathname} was not found`);
  } catch (error) {
    const mapped = mapAnalysisJobError(error);
    if (mapped) {
      sendJson(response, mapped.statusCode, { error: { code: mapped.code, message: mapped.message } }, corsOrigin);
      return true;
    }
    throw error;
  }
}
