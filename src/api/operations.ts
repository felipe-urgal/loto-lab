import type { IncomingMessage, ServerResponse } from "node:http";
import {
  OperationAlreadyRunningError,
  type OperationsUseCase,
} from "../application/operations.js";
import { sendJson } from "./http.js";
import { enforceRateLimit, FixedWindowRateLimiter } from "./rateLimit.js";

export interface OperationsApiOptions {
  corsOrigin?: string;
  staleAfterMinutes?: number;
}

const syncLimiter = new FixedWindowRateLimiter({ limit: 2, windowMs: 10 * 60_000 });

function positiveMinutes(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function enabled(value: string | undefined): boolean {
  if (value === undefined || value === "") return true;
  return value === "1" || value.toLowerCase() === "true";
}

export async function serveOperations(
  request: IncomingMessage,
  response: ServerResponse,
  options: OperationsApiOptions,
  operations: OperationsUseCase,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:5173";

  if (method === "GET" && url.pathname === "/api/v1/operations/status") {
    const staleAfterMinutes = options.staleAfterMinutes
      ?? positiveMinutes(process.env.OPS_STALE_AFTER_MINUTES, 180);
    const status = await operations.status({
      autoSyncEnabled: enabled(process.env.OPS_AUTO_SYNC),
      intervalMinutes: positiveMinutes(process.env.OPS_INTERVAL_MINUTES, 30),
      staleAfterMinutes,
    });
    sendJson(response, 200, status, corsOrigin);
    return true;
  }

  if (method === "POST" && url.pathname === "/api/v1/operations/sync") {
    if (!enforceRateLimit(request, response, syncLimiter, "operations-sync")) return true;
    try {
      const run = await operations.sync();
      sendJson(response, 200, run, corsOrigin);
    } catch (error) {
      if (error instanceof OperationAlreadyRunningError) {
        sendJson(response, 409, {
          error: { code: error.code, message: error.message },
        }, corsOrigin);
      } else {
        throw error;
      }
    }
    return true;
  }

  return false;
}
