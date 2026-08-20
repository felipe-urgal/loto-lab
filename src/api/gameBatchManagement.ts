import type { IncomingMessage, ServerResponse } from "node:http";
import { PostgresGameRepository, type GeneratedBatchScope } from "../persistence/gameRepository.js";
import type { ApiServerOptions } from "./app.js";
import {
  ApiError,
  parseLottery,
  parsePositiveInt,
  sendJson,
} from "./http.js";

function parseScope(value: string | null): GeneratedBatchScope {
  if (value === null || value === "active") return "active";
  if (value === "archived" || value === "all") return value;
  throw new ApiError(400, "INVALID_ARGUMENT", "scope must be active, archived or all");
}

function mapRepositoryError(error: unknown): ApiError | undefined {
  if (!(error instanceof Error)) return undefined;
  if (error.message.startsWith("BATCH_HAS_REAL_BET:")) {
    return new ApiError(
      409,
      "BATCH_HAS_REAL_BET",
      "A batch linked to a real bet cannot be archived",
    );
  }
  return undefined;
}

export async function serveGameBatchManagement(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:3000";
  const repository = new PostgresGameRepository(options.pool);

  try {
    const listMatch = /^\/api\/v1\/game-batches\/manage\/([^/]+)$/.exec(pathname);
    if (method === "GET" && listMatch) {
      const lottery = parseLottery(listMatch[1]);
      const limit = parsePositiveInt(url.searchParams.get("limit"), "limit", {
        min: 1,
        max: 200,
        defaultValue: 100,
      });
      const scope = parseScope(url.searchParams.get("scope"));
      const items = await repository.listRecent(lottery, limit, scope);
      const counts = {
        active: items.filter((item) => !item.archivedAt).length,
        archived: items.filter((item) => Boolean(item.archivedAt)).length,
        realBets: items.filter((item) => item.hasRealBet).length,
      };
      sendJson(response, 200, { items, counts, scope }, corsOrigin);
      return true;
    }

    const lifecycleMatch = /^\/api\/v1\/game-batches\/(\d+)\/(archive|restore)$/.exec(pathname);
    if (method === "POST" && lifecycleMatch) {
      const id = parsePositiveInt(lifecycleMatch[1], "batchId");
      const archived = lifecycleMatch[2] === "archive";
      const item = await repository.setArchived(id, archived);
      if (!item) {
        throw new ApiError(404, "BATCH_NOT_FOUND", `Game batch ${id} was not found`);
      }
      sendJson(response, 200, item, corsOrigin);
      return true;
    }

    return false;
  } catch (error) {
    const mapped = error instanceof ApiError ? error : mapRepositoryError(error);
    if (mapped) {
      sendJson(response, mapped.statusCode, {
        error: { code: mapped.code, message: mapped.message },
      }, corsOrigin);
      return true;
    }
    throw error;
  }
}
