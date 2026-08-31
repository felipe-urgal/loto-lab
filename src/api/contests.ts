import type { IncomingMessage, ServerResponse } from "node:http";
import type { ContestCatalogUseCase } from "../application/contestCatalog.js";
import type { ApiServerOptions } from "./app.js";
import {
  ApiError,
  parseLottery,
  parseOptionalPositiveInt,
  parsePositiveInt,
  sendJson,
  sendNoContent,
} from "./http.js";

function parseLimit(value: string | null, defaultValue = 20): number {
  return parsePositiveInt(value, "limit", { min: 1, max: 200, defaultValue });
}

export async function serveContests(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
  contests: ContestCatalogUseCase,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  const isRoute = pathname === "/api/v1/contests" || pathname.startsWith("/api/v1/contests/");
  if (!isRoute) return false;

  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:5173";

  try {
    if (method === "OPTIONS") {
      sendNoContent(response, corsOrigin);
      return true;
    }

    let match = /^\/api\/v1\/contests\/([^/]+)\/latest$/.exec(pathname);
    if (method === "GET" && match) {
      const lottery = parseLottery(match[1]);
      const contest = await contests.latest(lottery);
      if (!contest) throw new ApiError(404, "CONTEST_NOT_FOUND", `No contest stored for ${lottery}`);
      sendJson(response, 200, contest, corsOrigin);
      return true;
    }

    match = /^\/api\/v1\/contests\/([^/]+)\/(\d+)$/.exec(pathname);
    if (method === "GET" && match) {
      const lottery = parseLottery(match[1]);
      const contestNumber = parsePositiveInt(match[2], "contestNumber");
      const contest = await contests.findByNumber(lottery, contestNumber);
      if (!contest) {
        throw new ApiError(404, "CONTEST_NOT_FOUND", `Contest ${contestNumber} was not found for ${lottery}`);
      }
      sendJson(response, 200, contest, corsOrigin);
      return true;
    }

    match = /^\/api\/v1\/contests\/([^/]+)$/.exec(pathname);
    if (method === "GET" && match) {
      const lottery = parseLottery(match[1]);
      const startContest = parseOptionalPositiveInt(url.searchParams.get("startContest"), "startContest");
      const endContest = parseOptionalPositiveInt(url.searchParams.get("endContest"), "endContest");
      const order = url.searchParams.get("order") ?? "desc";
      if (order !== "asc" && order !== "desc") {
        throw new ApiError(400, "INVALID_ARGUMENT", "order must be asc or desc");
      }
      if (startContest !== undefined && endContest !== undefined && startContest > endContest) {
        throw new ApiError(400, "INVALID_ARGUMENT", "startContest must be less than or equal to endContest");
      }

      const items = await contests.list({
        lottery,
        ...(startContest !== undefined ? { startContest } : {}),
        ...(endContest !== undefined ? { endContest } : {}),
        order,
        limit: parseLimit(url.searchParams.get("limit"), 20),
      });
      sendJson(response, 200, { items }, corsOrigin);
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
    throw error;
  }
}
