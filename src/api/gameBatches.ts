import type { IncomingMessage, ServerResponse } from "node:http";
import type { CheckGameBatchUseCase } from "../application/checkGameBatch.js";
import type { GameBatchUseCase } from "../application/gameBatches.js";
import type { ApiServerOptions } from "./app.js";
import {
  ApiError,
  parseLottery,
  parsePositiveInt,
  readJsonBody,
  sendJson,
  sendNoContent,
} from "./http.js";

export async function serveGameBatches(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
  gameBatches: GameBatchUseCase,
  checkGameBatch: CheckGameBatchUseCase,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  const byIdMatch = /^\/api\/v1\/game-batches\/id\/(\d+)$/.exec(pathname);
  const recentMatch = /^\/api\/v1\/game-batches\/([^/]+)$/.exec(pathname);
  const isCheck = pathname === "/api/v1/games/check";
  if (!byIdMatch && !recentMatch && !isCheck) return false;

  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:5173";

  try {
    if (method === "OPTIONS") {
      sendNoContent(response, corsOrigin);
      return true;
    }

    if (method === "GET" && byIdMatch) {
      const id = parsePositiveInt(byIdMatch[1], "batchId");
      const batch = await gameBatches.find(id);
      if (!batch) throw new ApiError(404, "BATCH_NOT_FOUND", `Game batch ${id} was not found`);
      sendJson(response, 200, batch, corsOrigin);
      return true;
    }

    if (method === "GET" && recentMatch) {
      const lottery = parseLottery(recentMatch[1]);
      const limit = parsePositiveInt(url.searchParams.get("limit"), "limit", {
        min: 1,
        max: 200,
        defaultValue: 20,
      });
      const items = await gameBatches.listRecent(lottery, limit);
      sendJson(response, 200, { items }, corsOrigin);
      return true;
    }

    if (method === "POST" && isCheck) {
      const body = await readJsonBody(request);
      const batchId = parsePositiveInt(body.batchId, "batchId");
      const contestNumber = parsePositiveInt(body.contestNumber, "contestNumber");
      const result = await checkGameBatch.execute(batchId, contestNumber);
      if (!result) throw new ApiError(404, "BATCH_NOT_FOUND", `Game batch ${batchId} was not found`);
      if (!result.target || !result.checks) {
        throw new ApiError(
          404,
          "CONTEST_NOT_FOUND",
          `Contest ${contestNumber} was not found for ${result.batch.lottery}`,
        );
      }
      sendJson(response, 200, result, corsOrigin);
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

    console.error("Loto Lab game batch request failed", error);
    sendJson(response, 500, {
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
    }, corsOrigin);
    return true;
  }
}
