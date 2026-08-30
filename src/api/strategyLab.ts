import type { IncomingMessage, ServerResponse } from "node:http";
import {
  EmptyStrategyLabPeriodError,
  InsufficientStrategyLabHistoryError,
  StrategyLabBusyError,
  StrategyLabTooLargeError,
  type RunStrategyLabUseCase,
} from "../application/runStrategyLab.js";
import type { ApiServerOptions } from "./app.js";
import {
  ApiError,
  parseLottery,
  readJsonBody,
  sendJson,
} from "./http.js";
import { enforceRateLimit, FixedWindowRateLimiter } from "./rateLimit.js";
import { parseStrategyLabOptions } from "./strategyLabInput.js";
export { estimateStrategyLabWorkUnits } from "../application/runStrategyLab.js";
import {
  AnalysisCancelledError,
  AnalysisTimeoutError,
} from "./workerClient.js";

const labLimiter = new FixedWindowRateLimiter({ limit: 4, windowMs: 10 * 60_000 });

function mapStrategyLabError(error: unknown): ApiError | undefined {
  if (error instanceof ApiError) return error;
  if (error instanceof InsufficientStrategyLabHistoryError) {
    return new ApiError(409, error.code, error.message);
  }
  if (error instanceof EmptyStrategyLabPeriodError) {
    return new ApiError(409, error.code, error.message);
  }
  if (error instanceof StrategyLabTooLargeError) {
    return new ApiError(400, error.code, error.message);
  }
  if (error instanceof StrategyLabBusyError) {
    return new ApiError(429, error.code, error.message);
  }
  if (error instanceof AnalysisTimeoutError) {
    return new ApiError(504, "ANALYSIS_TIMEOUT", "Strategy Lab exceeded the safe execution limit");
  }
  return undefined;
}

export async function serveStrategyLab(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
  runStrategyLab: RunStrategyLabUseCase,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  if (method !== "POST" || url.pathname !== "/api/v1/lab/compare") return false;

  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:3000";

  try {
    if (!enforceRateLimit(request, response, labLimiter, "strategy-lab")) return true;
    const body = await readJsonBody(request);
    const lottery = parseLottery(body.lottery);
    const workerInput = parseStrategyLabOptions(body, lottery);
    const controller = new AbortController();
    const abortWorker = () => controller.abort();
    request.once("aborted", abortWorker);
    response.once("close", abortWorker);

    try {
      const result = await runStrategyLab.execute(workerInput, controller.signal);
      if (response.destroyed || response.writableEnded) return true;
      sendJson(response, 200, result, corsOrigin);
      return true;
    } catch (error) {
      if (error instanceof AnalysisCancelledError && (request.destroyed || response.destroyed)) return true;
      throw error;
    } finally {
      request.off("aborted", abortWorker);
      response.off("close", abortWorker);
    }
  } catch (error) {
    const mapped = mapStrategyLabError(error);
    if (mapped) {
      if (!response.destroyed && !response.writableEnded) {
        sendJson(response, mapped.statusCode, {
          error: { code: mapped.code, message: mapped.message },
        }, corsOrigin);
      }
      return true;
    }
    throw error;
  }
}
