import { createServer, type RequestListener, type Server } from "node:http";
import type { Pool } from "pg";
import { LOTTERY_CONFIGS } from "../lotteries/config.js";
import { LotoLabApiServices } from "./services.js";
import {
  ApiError,
  parseLottery,
  parsePositiveInt,
  readJsonBody,
  sendJson,
  sendNoContent,
} from "./http.js";

export interface ApiServerOptions {
  pool: Pool;
  corsOrigin?: string;
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

      let match = pathMatch(pathname, /^\/api\/v1\/game-batches\/id\/(\d+)$/);
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

      // Strategy, backtest and generation endpoints live exclusively in feature controllers
      // so validation and application orchestration cannot drift from legacy copies.

      throw new ApiError(404, "ROUTE_NOT_FOUND", `${method} ${pathname} was not found`);
    } catch (error) {
      if (error instanceof ApiError) {
        sendJson(response, error.statusCode, {
          error: { code: error.code, message: error.message },
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
