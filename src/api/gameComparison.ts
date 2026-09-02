import type { IncomingMessage, ServerResponse } from "node:http";
import {
  ComparisonStartRequiredError,
  type CompareGameBatchUseCase,
} from "../application/compareGameBatch.js";
import type { ApiServerOptions } from "./app.js";
import {
  ApiError,
  parseOptionalPositiveInt,
  parsePositiveInt,
  sendJson,
  sendNoContent,
} from "./http.js";

export async function serveGameComparison(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
  compareGameBatch: CompareGameBatchUseCase,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  const match = /^\/api\/v1\/game-batches\/(\d+)\/comparison$/.exec(pathname);
  if (!match) return false;

  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:3000";
  if (method === "OPTIONS") {
    sendNoContent(response, corsOrigin);
    return true;
  }
  if (method !== "GET") {
    throw new ApiError(405, "METHOD_NOT_ALLOWED", `${method} ${pathname} is not allowed`);
  }

  const batchId = parsePositiveInt(match[1], "batchId");
  const count = parsePositiveInt(url.searchParams.get("count"), "count", {
    min: 1,
    max: 20,
    defaultValue: 5,
  });
  const requestedStart = parseOptionalPositiveInt(url.searchParams.get("startContest"), "startContest");

  let comparison: Awaited<ReturnType<CompareGameBatchUseCase["execute"]>>;
  try {
    comparison = await compareGameBatch.execute({
      batchId,
      count,
      ...(requestedStart !== undefined ? { startContest: requestedStart } : {}),
    });
  } catch (error) {
    if (error instanceof ComparisonStartRequiredError) {
      throw new ApiError(400, "COMPARISON_START_REQUIRED", error.message);
    }
    throw error;
  }

  if (!comparison) throw new ApiError(404, "BATCH_NOT_FOUND", `Game batch ${batchId} was not found`);

  sendJson(response, 200, comparison, corsOrigin);
  return true;
}
