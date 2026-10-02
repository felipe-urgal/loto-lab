import type { IncomingMessage, ServerResponse } from "node:http";
import type { EvaluateGameBatchCoverageUseCase } from "../application/evaluateGameBatchCoverage.js";
import type { ApiServerOptions } from "./app.js";
import { ApiError, parsePositiveInt, sendJson, sendNoContent } from "./http.js";

function optionalString(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function optionalProbability(value: string | null, name: string): number | undefined {
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) {
    throw new ApiError(400, "INVALID_ARGUMENT", `${name} must be between 0 and 1`);
  }
  return parsed;
}

export async function serveGameCoverage(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
  evaluateCoverage: EvaluateGameBatchCoverageUseCase,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  const match = /^\/api\/v1\/game-batches\/(\d+)\/coverage$/.exec(pathname);
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
  const samples = url.searchParams.has("samples")
    ? parsePositiveInt(url.searchParams.get("samples"), "samples", {
        min: 1_000,
        max: 100_000,
      })
    : undefined;
  const seed = optionalString(url.searchParams.get("seed"));
  const maxMarginError = optionalProbability(url.searchParams.get("maxMarginError"), "maxMarginError");

  const result = await evaluateCoverage.execute({
    batchId,
    ...(seed ? { seed } : {}),
    ...(samples !== undefined ? { samples } : {}),
    ...(maxMarginError !== undefined ? { maxMarginError } : {}),
  });
  if (!result) throw new ApiError(404, "BATCH_NOT_FOUND", `Game batch ${batchId} was not found`);

  sendJson(response, 200, result, corsOrigin);
  return true;
}
