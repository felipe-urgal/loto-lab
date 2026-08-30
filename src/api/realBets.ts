import type { IncomingMessage, ServerResponse } from "node:http";
import {
  RealBetUseCaseError,
  type RealBetUseCase,
  type RealBetUseCaseErrorCode,
} from "../application/realBets.js";
import { normalizeIsoDateTime } from "../domain/dateTime.js";
import {
  ApiError,
  parseLottery,
  parsePositiveInt,
  readJsonBody,
  sendJson,
  sendNoContent,
} from "./http.js";

export interface RealBetsApiOptions {
  corsOrigin?: string;
}

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
  if (typeof value !== "string") {
    throw new ApiError(400, "INVALID_ARGUMENT", "playedAt must be a valid ISO date/time with timezone");
  }
  const normalized = normalizeIsoDateTime(value);
  if (!normalized) {
    throw new ApiError(400, "INVALID_ARGUMENT", "playedAt must be a valid ISO date/time with timezone");
  }
  return normalized;
}

function statusForRealBetError(code: RealBetUseCaseErrorCode): number {
  switch (code) {
    case "BATCH_NOT_FOUND":
    case "REAL_BET_NOT_FOUND":
      return 404;
    case "REAL_BET_ALREADY_EXISTS":
    case "CONTEST_TARGET_MISMATCH":
    case "RESULT_ALREADY_KNOWN":
    case "RESULT_NOT_AVAILABLE":
      return 409;
    case "CONTEST_NUMBER_REQUIRED":
    case "INVALID_GAME_POSITIONS":
    case "INVALID_PLAYED_AT":
      return 400;
  }
}

export async function serveRealBets(
  request: IncomingMessage,
  response: ServerResponse,
  options: RealBetsApiOptions,
  realBets: RealBetUseCase,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  const isRoute = pathname === "/api/v1/real-bets" || pathname.startsWith("/api/v1/real-bets/");
  if (!isRoute) return false;

  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:3000";

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
      const created = await realBets.create({
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
      sendJson(response, 200, await realBets.reconcilePending(lottery), corsOrigin);
      return true;
    }

    const checkMatch = /^\/api\/v1\/real-bets\/(\d+)\/check$/.exec(pathname);
    if (method === "POST" && checkMatch) {
      const id = parsePositiveInt(checkMatch[1], "realBetId");
      sendJson(response, 200, await realBets.check(id), corsOrigin);
      return true;
    }

    const revisionsMatch = /^\/api\/v1\/real-bets\/(\d+)\/revisions$/.exec(pathname);
    if (method === "GET" && revisionsMatch) {
      const id = parsePositiveInt(revisionsMatch[1], "realBetId");
      sendJson(response, 200, await realBets.financialRevisions(id), corsOrigin);
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
      sendJson(response, 200, await realBets.list(lottery, limit), corsOrigin);
      return true;
    }

    throw new ApiError(404, "ROUTE_NOT_FOUND", `${method} ${pathname} was not found`);
  } catch (error) {
    const mapped = error instanceof ApiError
      ? error
      : error instanceof RealBetUseCaseError
        ? new ApiError(statusForRealBetError(error.code), error.code, error.message)
        : undefined;
    if (mapped) {
      sendJson(response, mapped.statusCode, { error: { code: mapped.code, message: mapped.message } }, corsOrigin);
      return true;
    }
    throw error;
  }
}
