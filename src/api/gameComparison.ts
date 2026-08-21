import type { IncomingMessage, ServerResponse } from "node:http";
import { evaluateGames, type GameCheckResult } from "../checker/evaluate.js";
import type { GeneratedGameBatchRecord } from "../persistence/types.js";
import { PostgresContestRepository } from "../persistence/contestRepository.js";
import { PostgresGameRepository } from "../persistence/gameRepository.js";
import type { ApiServerOptions } from "./app.js";
import {
  ApiError,
  parseOptionalPositiveInt,
  parsePositiveInt,
  sendJson,
  sendNoContent,
} from "./http.js";

interface ComparisonGameResult {
  position: number;
  hits: number;
  matchedNumbers: number[];
  fixedMatchedNumbers: number[];
  variableMatchedNumbers: number[];
  prizeTier?: string;
  luckyMonthHit?: boolean;
}

interface ComparisonContestResult {
  contestNumber: number;
  date: string;
  numbers: number[];
  luckyMonth?: string;
  bestHits: number;
  matchedAnyNumbers: number[];
  games: ComparisonGameResult[];
}

function compactGameCheck(check: GameCheckResult, position: number): ComparisonGameResult {
  return {
    position,
    hits: check.hits,
    matchedNumbers: check.matchedNumbers,
    fixedMatchedNumbers: check.fixedMatchedNumbers,
    variableMatchedNumbers: check.variableMatchedNumbers,
    ...(check.prizeTier ? { prizeTier: check.prizeTier } : {}),
    ...(check.luckyMonthHit !== undefined ? { luckyMonthHit: check.luckyMonthHit } : {}),
  };
}

function summarize(items: ComparisonContestResult[]) {
  if (items.length === 0) {
    return {
      contestCount: 0,
      bestHits: 0,
      bestContestNumber: undefined,
      averageBestHits: 0,
    };
  }

  let best = items[0]!;
  for (const item of items.slice(1)) {
    if (item.bestHits > best.bestHits) best = item;
  }

  return {
    contestCount: items.length,
    bestHits: best.bestHits,
    bestContestNumber: best.contestNumber,
    averageBestHits: items.reduce((sum, item) => sum + item.bestHits, 0) / items.length,
  };
}

export function buildBatchComparison(
  batch: GeneratedGameBatchRecord,
  contests: Array<{ number: number; date: string; numbers: number[]; luckyMonth?: string }>,
) {
  const items: ComparisonContestResult[] = contests.map((contest) => {
    const checks = evaluateGames(batch.games, {
      lottery: batch.lottery,
      number: contest.number,
      date: contest.date,
      numbers: contest.numbers,
      ...(contest.luckyMonth ? { luckyMonth: contest.luckyMonth } : {}),
    });
    const matchedAnyNumbers = [...new Set(checks.flatMap((check) => check.matchedNumbers))].sort((a, b) => a - b);
    return {
      contestNumber: contest.number,
      date: contest.date,
      numbers: contest.numbers,
      ...(contest.luckyMonth ? { luckyMonth: contest.luckyMonth } : {}),
      bestHits: checks.length ? Math.max(...checks.map((check) => check.hits)) : 0,
      matchedAnyNumbers,
      games: checks.map((check, index) => compactGameCheck(check, index + 1)),
    };
  });

  return {
    batchId: batch.id,
    lottery: batch.lottery,
    targetContestNumber: batch.targetContestNumber,
    drawSize: batch.games[0]?.numbers.length ?? 0,
    summary: summarize(items),
    items,
  };
}

export async function serveGameComparison(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
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
  const games = new PostgresGameRepository(options.pool);
  const contests = new PostgresContestRepository(options.pool);
  const batch = await games.findBatch(batchId);
  if (!batch) throw new ApiError(404, "BATCH_NOT_FOUND", `Game batch ${batchId} was not found`);

  const minimumContest = batch.targetContestNumber;
  const startContest = requestedStart ?? minimumContest;
  if (startContest === undefined) {
    throw new ApiError(
      400,
      "COMPARISON_START_REQUIRED",
      "This legacy batch has no target contest; choose a starting contest to compare it safely",
    );
  }
  if (minimumContest !== undefined && startContest < minimumContest) {
    throw new ApiError(
      400,
      "COMPARISON_BEFORE_TARGET",
      `Comparison starts at contest ${minimumContest} because earlier contests belong to the generation context`,
    );
  }

  const selected = await contests.list({
    lottery: batch.lottery,
    startContest,
    order: "asc",
    limit: count,
  });

  const comparison = buildBatchComparison(batch, selected);
  const lastAvailable = selected.length > 0
    ? selected[0]!.number
    : (await contests.list({
      lottery: batch.lottery,
      endContest: startContest - 1,
      order: "desc",
      limit: 1,
    }))[0]?.number;
  const available = selected.length > 0;

  sendJson(response, 200, {
    ...comparison,
    startContestNumber: startContest,
    requestedCount: count,
    availability: {
      status: available ? "available" : "pending",
      available,
      targetContestNumber: startContest,
      ...(lastAvailable !== undefined ? { lastAvailableContestNumber: lastAvailable } : {}),
      message: available
        ? undefined
        : `O resultado do concurso #${startContest} ainda não está disponível no histórico sincronizado.`,
    },
    scope: {
      kind: minimumContest === undefined ? "manual-anchor" : "post-target",
      minimumContestNumber: minimumContest,
      financial: false,
      note: minimumContest === undefined
        ? "Comparação exploratória a partir do concurso escolhido; nenhum valor financeiro é registrado."
        : "Somente concursos a partir do alvo são comparados; resultados anteriores faziam parte do contexto usado para gerar o lote.",
    },
  }, corsOrigin);
  return true;
}
