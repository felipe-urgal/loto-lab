import type { IncomingMessage, ServerResponse } from "node:http";
import type { BacktestCatalogUseCase } from "../application/backtestCatalog.js";
import type { ApiServerOptions } from "./app.js";
import { ApiError, parseLottery, parsePositiveInt, sendJson, sendNoContent } from "./http.js";

function parseLimit(value: string | null): number {
  return parsePositiveInt(value, "limit", { min: 1, max: 200, defaultValue: 20 });
}

export async function serveBacktests(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
  catalog: BacktestCatalogUseCase,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  const runMatch = /^\/api\/v1\/backtest-runs\/(\d+)$/.exec(pathname);
  const listMatch = /^\/api\/v1\/backtests\/([^/]+)$/.exec(pathname);
  const isCatalogRoute = Boolean(runMatch || (listMatch && listMatch[1] !== "run"));
  if (!isCatalogRoute) return false;

  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:5173";

  try {
    if (method === "OPTIONS") {
      sendNoContent(response, corsOrigin);
      return true;
    }

    if (method === "GET" && runMatch) {
      const id = parsePositiveInt(runMatch[1], "backtestRunId");
      const run = await catalog.get(id);
      if (!run) throw new ApiError(404, "BACKTEST_NOT_FOUND", `Backtest run ${id} was not found`);
      sendJson(response, 200, run, corsOrigin);
      return true;
    }

    if (method === "GET" && listMatch) {
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
    throw error;
  }
}
