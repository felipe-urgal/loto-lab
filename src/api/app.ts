import { createServer, type RequestListener, type Server } from "node:http";
import type { Pool } from "pg";
import { LOTTERY_CONFIGS } from "../lotteries/config.js";
import {
  ApiError,
  sendJson,
  sendNoContent,
} from "./http.js";

export interface ApiServerOptions {
  pool: Pool;
  corsOrigin?: string;
}

export function createApiRequestHandler(options: ApiServerOptions): RequestListener {
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

      // Strategy, backtest, generation and game-batch endpoints live exclusively
      // in feature controllers so validation and application orchestration cannot drift.

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
