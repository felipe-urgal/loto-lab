import type { IncomingMessage, ServerResponse } from "node:http";
import type { AnalyzeAdvancedLotteryUseCase } from "../application/analyzeAdvancedLottery.js";
import type { AnalyzeLotteryUseCase } from "../application/analyzeLottery.js";
import type { ApiServerOptions } from "./app.js";
import { ApiError, parseLottery, sendJson, sendNoContent } from "./http.js";

export async function serveAnalysis(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
  analyzeLottery: AnalyzeLotteryUseCase,
  analyzeAdvancedLottery: AnalyzeAdvancedLotteryUseCase,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  const isRoute = pathname.startsWith("/api/v1/analysis/");
  if (!isRoute) return false;

  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:5173";

  try {
    if (method === "OPTIONS") {
      sendNoContent(response, corsOrigin);
      return true;
    }

    let match = /^\/api\/v1\/analysis\/([^/]+)\/advanced$/.exec(pathname);
    if (method === "GET" && match) {
      const lottery = parseLottery(match[1]);
      sendJson(response, 200, await analyzeAdvancedLottery.execute(lottery), corsOrigin);
      return true;
    }

    match = /^\/api\/v1\/analysis\/([^/]+)$/.exec(pathname);
    if (method === "GET" && match) {
      const lottery = parseLottery(match[1]);
      sendJson(response, 200, await analyzeLottery.execute(lottery), corsOrigin);
      return true;
    }

    throw new ApiError(404, "ROUTE_NOT_FOUND", `${method} ${pathname} was not found`);
  } catch (error) {
    if (error instanceof ApiError) {
      sendJson(response, error.statusCode, {
        error: { code: error.code, message: error.message },
      }, corsOrigin);
      return true;
    }

    console.error("Loto Lab analysis request failed", error);
    sendJson(response, 500, {
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
    }, corsOrigin);
    return true;
  }
}
