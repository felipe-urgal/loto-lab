import type { IncomingMessage, ServerResponse } from "node:http";
import type { GameBatchScope, GameBatchUseCase } from "../application/gameBatches.js";
import type { ApiServerOptions } from "./app.js";
import {
  ApiError,
  parseLottery,
  parsePositiveInt,
  sendJson,
} from "./http.js";

function parseScope(value: string | null): GameBatchScope {
  if (value === null || value === "active") return "active";
  if (value === "archived" || value === "all") return value;
  throw new ApiError(400, "INVALID_ARGUMENT", "scope must be active, archived or all");
}

export async function serveGameBatchManagement(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
  gameBatches: GameBatchUseCase,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:3000";

  const listMatch = /^\/api\/v1\/game-batches\/manage\/([^/]+)$/.exec(pathname);
  if (method === "GET" && listMatch) {
    const lottery = parseLottery(listMatch[1]);
    const limit = parsePositiveInt(url.searchParams.get("limit"), "limit", {
      min: 1,
      max: 200,
      defaultValue: 100,
    });
    const scope = parseScope(url.searchParams.get("scope"));
    const result = await gameBatches.manage(lottery, limit, scope);
    sendJson(response, 200, result, corsOrigin);
    return true;
  }

  // archive/restore stay as backwards-compatible aliases. The product language is
  // hide/show because this lifecycle never deletes the batch or its real-bet history.
  const lifecycleMatch = /^\/api\/v1\/game-batches\/(\d+)\/(archive|restore|hide|show)$/.exec(pathname);
  if (method === "POST" && lifecycleMatch) {
    const id = parsePositiveInt(lifecycleMatch[1], "batchId");
    const hidden = lifecycleMatch[2] === "archive" || lifecycleMatch[2] === "hide";
    const item = await gameBatches.setHidden(id, hidden);
    if (!item) {
      throw new ApiError(404, "BATCH_NOT_FOUND", `Game batch ${id} was not found`);
    }
    sendJson(response, 200, item, corsOrigin);
    return true;
  }

  return false;
}
