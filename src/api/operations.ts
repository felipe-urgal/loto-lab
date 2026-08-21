import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import type { ContestSource } from "../data/source.js";
import { PostgresOperationRepository } from "../persistence/operationRepository.js";
import {
  OperationAlreadyRunningError,
  runOperationalSync,
  type SyncAllDetails,
} from "../operations/sync.js";
import { sendJson } from "./http.js";
import { enforceRateLimit, FixedWindowRateLimiter } from "./rateLimit.js";

export interface OperationsApiOptions {
  pool: Pool;
  corsOrigin?: string;
  operationSource?: ContestSource;
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
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:5173";

  if (method === "GET" && url.pathname === "/api/v1/operations/status") {
    const latest = await new PostgresOperationRepository(options.pool).latest<SyncAllDetails>("sync-all");
    const staleAfterMinutes = options.staleAfterMinutes ?? positiveMinutes(process.env.OPS_STALE_AFTER_MINUTES, 180);
    const reference = latest?.finishedAt ?? latest?.startedAt;
    const ageMinutes = reference ? Math.max(0, (Date.now() - Date.parse(reference)) / 60_000) : undefined;
    const stale = !latest
      || latest.status === "failed"
      || latest.status === "abandoned"
      || ageMinutes === undefined
      || ageMinutes > staleAfterMinutes;

    sendJson(response, 200, {
      autoSyncEnabled: enabled(process.env.OPS_AUTO_SYNC),
      intervalMinutes: positiveMinutes(process.env.OPS_INTERVAL_MINUTES, 30),
      staleAfterMinutes,
      stale,
      ...(ageMinutes !== undefined ? { ageMinutes } : {}),
      ...(latest ? { latest } : {}),
    }, corsOrigin);
    return true;
  }

  if (method === "POST" && url.pathname === "/api/v1/operations/sync") {
    if (!enforceRateLimit(request, response, syncLimiter, "operations-sync")) return true;
    try {
      const run = await runOperationalSync(options.pool, {
        ...(options.operationSource ? { source: options.operationSource } : {}),
      });
      sendJson(response, 200, run, corsOrigin);
    } catch (error) {
      if (error instanceof OperationAlreadyRunningError) {
        sendJson(response, 409, {
          error: { code: "OPERATION_ALREADY_RUNNING", message: error.message },
        }, corsOrigin);
      } else {
        throw error;
      }
    }
    return true;
  }

  return false;
}
