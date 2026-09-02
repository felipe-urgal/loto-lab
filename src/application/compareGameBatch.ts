import { evaluateGames, type GameCheckResult } from "../checker/evaluate.js";
import type { Contest } from "../domain/types.js";
import type { ContestListQuery } from "./contestCatalog.js";
import type { ApplicationGameBatch } from "./gameBatch.js";

export interface GameComparisonBatchReader {
  findBatch(id: number): Promise<ApplicationGameBatch | undefined>;
}

export interface GameComparisonContestReader {
  list(options: ContestListQuery): Promise<Contest[]>;
}

export type ComparisonContest = Pick<Contest, "number" | "date" | "numbers" | "luckyMonth">;

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

export interface ComparisonAvailability {
  status: "available" | "pending";
  targetContestNumber: number;
  lastAvailableContestNumber?: number;
}

export interface ComparisonScope {
  kind: "backtest" | "post-target";
  minimumContestNumber?: number;
  financial: false;
  note: string;
}

export interface CompareGameBatchInput {
  batchId: number;
  count: number;
  startContest?: number;
}

export class ComparisonStartRequiredError extends Error {
  constructor() {
    super("This legacy batch has no target contest; choose a starting contest to compare it safely");
    this.name = "ComparisonStartRequiredError";
  }
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

export function buildComparisonAvailability(
  targetContestNumber: number,
  selected: Array<{ number: number }>,
  lastAvailableBeforeStart?: number,
): ComparisonAvailability {
  return {
    status: selected.length > 0 ? "available" : "pending",
    ...(selected.at(-1)?.number ?? lastAvailableBeforeStart) !== undefined
      ? { lastAvailableContestNumber: selected.at(-1)?.number ?? lastAvailableBeforeStart }
      : {},
    targetContestNumber,
  };
}

export function buildBatchComparison(
  batch: ApplicationGameBatch,
  contests: ComparisonContest[],
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

function buildComparisonScope(
  minimumContestNumber: number | undefined,
  startContest: number,
): ComparisonScope {
  const isBacktest = minimumContestNumber !== undefined && startContest < minimumContestNumber;
  return {
    kind: isBacktest ? "backtest" : "post-target",
    ...(minimumContestNumber !== undefined ? { minimumContestNumber } : {}),
    financial: false,
    note: isBacktest
      ? "Backtest histórico dos jogos gerados contra concursos anteriores ao alvo; nenhum valor financeiro é registrado."
      : minimumContestNumber === undefined
        ? "Comparação exploratória a partir do concurso escolhido; nenhum valor financeiro é registrado."
        : "Comparação dos jogos a partir do concurso-alvo; nenhum valor financeiro é registrado.",
  };
}

export class CompareGameBatchUseCase {
  constructor(
    private readonly batches: GameComparisonBatchReader,
    private readonly contests: GameComparisonContestReader,
  ) {}

  async execute(input: CompareGameBatchInput) {
    const batch = await this.batches.findBatch(input.batchId);
    if (!batch) return undefined;

    const minimumContest = batch.targetContestNumber;
    const startContest = input.startContest ?? minimumContest;
    if (startContest === undefined) throw new ComparisonStartRequiredError();

    const selected = await this.contests.list({
      lottery: batch.lottery,
      startContest,
      order: "asc",
      limit: input.count,
    });

    const lastAvailableBeforeStart = selected.length === 0
      ? (await this.contests.list({
        lottery: batch.lottery,
        endContest: startContest - 1,
        order: "desc",
        limit: 1,
      }))[0]?.number
      : undefined;

    return {
      ...buildBatchComparison(batch, selected),
      startContestNumber: startContest,
      requestedCount: input.count,
      availability: buildComparisonAvailability(startContest, selected, lastAvailableBeforeStart),
      scope: buildComparisonScope(minimumContest, startContest),
    };
  }
}
