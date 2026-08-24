import type { IncomingMessage, ServerResponse } from "node:http";
import { PostgresContestRepository } from "../persistence/contestRepository.js";
import type { ApiServerOptions } from "./app.js";
import {
  ApiError,
  parseLottery,
  readJsonBody,
  sendJson,
} from "./http.js";
import { enforceRateLimit, FixedWindowRateLimiter } from "./rateLimit.js";
import {
  parseStrategyLabOptions,
  validateStrategyLabExecution,
} from "./strategyLabInput.js";
export { estimateStrategyLabWorkUnits } from "./strategyLabInput.js";
import { expensiveAnalysisGate } from "./workGate.js";
import {
  AnalysisCancelledError,
  AnalysisTimeoutError,
  runStrategyLabInWorker,
} from "./workerClient.js";

const labLimiter = new FixedWindowRateLimiter({ limit: 4, windowMs: 10 * 60_000 });

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
    const workerInput = parseStrategyLabOptions(body, lottery);
    const contests = await new PostgresContestRepository(options.pool).list({ lottery, order: "asc" });
    validateStrategyLabExecution(contests, workerInput);

    const release = expensiveAnalysisGate.acquire();
    if (!release) {
      throw new ApiError(429, "ANALYSIS_BUSY", "Another backtest or Strategy Lab analysis is already running");
    }

    try {
      const controller = new AbortController();
      const abortWorker = () => controller.abort();
      request.once("aborted", abortWorker);
      response.once("close", abortWorker);

      try {
        const result = await runStrategyLabInWorker(contests, workerInput, controller.signal);
        if (response.destroyed || response.writableEnded) return true;
        sendJson(response, 200, result, corsOrigin);
        return true;
      } catch (error) {
        if (error instanceof AnalysisTimeoutError) {
          throw new ApiError(504, "ANALYSIS_TIMEOUT", "Strategy Lab exceeded the safe execution limit");
        }
        if (error instanceof AnalysisCancelledError && (request.destroyed || response.destroyed)) return true;
        throw error;
      } finally {
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
