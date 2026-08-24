import type { IncomingMessage, ServerResponse } from "node:http";
import { RealBetService } from "../realBets/service.js";
import type { ApiServerOptions } from "./app.js";
import {
  ApiError,
  parseLottery,
  parsePositiveInt,
  readJsonBody,
  sendJson,
  sendNoContent,
} from "./http.js";

function parseActualCost(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000_000_000) {
    throw new ApiError(400, "INVALID_ARGUMENT", "actualCost must be a positive number");
  }
  return Math.round(parsed * 100) / 100;
}

function parseGamePositions(value: unknown): number[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError(400, "INVALID_ARGUMENT", "gamePositions must be a non-empty array");
  }
  return value.map((item, index) => parsePositiveInt(item, `gamePositions[${index}]`, { min: 1, max: 100 }));
}

function parsePlayedAt(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !Number.isFinite(new Date(value).getTime())) {
    throw new ApiError(400, "INVALID_ARGUMENT", "playedAt must be a valid ISO date/time");
  }
  return new Date(value).toISOString();
}

function serviceError(error: unknown): ApiError | undefined {
  if (!(error instanceof Error)) return undefined;
  if (error.message.startsWith("BATCH_NOT_FOUND:")) {
    return new ApiError(404, "BATCH_NOT_FOUND", `Game batch ${error.message.split(":")[1]} was not found`);
  }
  if (error.message.startsWith("REAL_BET_ALREADY_EXISTS:")) {
    return new ApiError(409, "REAL_BET_ALREADY_EXISTS", "This generated batch is already marked as a real bet");
  }
  if (error.message.startsWith("CONTEST_TARGET_MISMATCH:")) {
    const [, expected, received] = error.message.split(":");
    return new ApiError(
      409,
      "CONTEST_TARGET_MISMATCH",
      `This batch targets contest ${expected}; it cannot be registered as a real bet for contest ${received}`,
    );
  }
  if (error.message.startsWith("RESULT_ALREADY_KNOWN:")) {
    const contest = error.message.split(":")[1];
    return new ApiError(
      409,
      "RESULT_ALREADY_KNOWN",
      `Contest ${contest} is already stored. Historical results cannot be registered as live real bets.`,
    );
  }
  if (error.message === "CONTEST_NUMBER_REQUIRED") {
    return new ApiError(400, "CONTEST_NUMBER_REQUIRED", "A contest number is required for a real bet");
  }
  if (error.message === "INVALID_GAME_POSITIONS") {
    return new ApiError(400, "INVALID_GAME_POSITIONS", "gamePositions contains a game that does not exist in the batch");
  }
  if (error.message === "INVALID_PLAYED_AT") {
    return new ApiError(400, "INVALID_PLAYED_AT", "playedAt is invalid");
  }
  return undefined;
}

export async function serveRealBets(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  const isRoute = pathname === "/api/v1/real-bets" || pathname.startsWith("/api/v1/real-bets/");
  if (!isRoute) return false;

  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:3000";
  const service = new RealBetService(options.pool);

  try {
    if (method === "OPTIONS") {
      sendNoContent(response, corsOrigin);
      return true;
    }

    if (method === "POST" && pathname === "/api/v1/real-bets") {
      const body = await readJsonBody(request);
      const batchId = parsePositiveInt(body.batchId, "batchId");
      const contestNumber = body.contestNumber === undefined
        ? undefined
        : parsePositiveInt(body.contestNumber, "contestNumber");
      const actualCost = parseActualCost(body.actualCost);
      const gamePositions = parseGamePositions(body.gamePositions);
      const playedAt = parsePlayedAt(body.playedAt);
      const created = await service.create({
        batchId,
        actualCost,
        ...(contestNumber !== undefined ? { contestNumber } : {}),
        ...(gamePositions !== undefined ? { gamePositions } : {}),
        ...(playedAt !== undefined ? { playedAt } : {}),
      });
      sendJson(response, 201, created, corsOrigin);
      return true;
    }

    if (method === "POST" && pathname === "/api/v1/real-bets/reconcile") {
      const body = await readJsonBody(request);
      const lottery = body.lottery === undefined ? undefined : parseLottery(body.lottery);
      const checked = await service.reconcilePending(lottery);
      sendJson(response, 200, { checked }, corsOrigin);
      return true;
    }

    const checkMatch = /^\/api\/v1\/real-bets\/(\d+)\/check$/.exec(pathname);
    if (method === "POST" && checkMatch) {
      const id = parsePositiveInt(checkMatch[1], "realBetId");
      const item = await service.reconcile(id);
      if (!item) throw new ApiError(404, "REAL_BET_NOT_FOUND", `Real bet ${id} was not found`);
      if (item.status !== "checked") {
        throw new ApiError(409, "RESULT_NOT_AVAILABLE", `Contest ${item.contestNumber} is not stored yet for ${item.lottery}`);
      }
      sendJson(response, 200, item, corsOrigin);
      return true;
    }

    const getMatch = /^\/api\/v1\/real-bets\/([^/]+)$/.exec(pathname);
    if (method === "GET" && getMatch) {
      const lottery = parseLottery(getMatch[1]);
      const limit = parsePositiveInt(url.searchParams.get("limit"), "limit", {
        min: 1,
        max: 200,
        defaultValue: 50,
      });
      sendJson(response, 200, await service.list(lottery, limit), corsOrigin);
      return true;
    }

    throw new ApiError(404, "ROUTE_NOT_FOUND", `${method} ${pathname} was not found`);
  } catch (error) {
    const mapped = error instanceof ApiError ? error : serviceError(error);
    if (mapped) {
      sendJson(response, mapped.statusCode, { error: { code: mapped.code, message: mapped.message } }, corsOrigin);
      return true;
    }
    throw error;
  }
}
