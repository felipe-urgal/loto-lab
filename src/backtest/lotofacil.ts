import type { Contest, GeneratedGame } from "../domain/types.js";
import { evaluateGames, type GameCheckResult } from "../checker/evaluate.js";
import { generateLotofacilGames } from "../generator/lotofacil.js";
import { summarizeBacktestRounds, type BacktestSummary } from "./shared.js";

export interface LotofacilBacktestOptions {
  gameCount?: number;
  fixedCount?: 8 | 9 | 10;
  warmupContests?: number;
  startContest?: number;
  endContest?: number;
}

export interface LotofacilBacktestRound {
  contest: number;
  date: string;
  targetNumbers: number[];
  generatedGames: GeneratedGame[];
  checks: GameCheckResult[];
  bestHits: number;
  fixedHits: number;
}

export interface LotofacilBacktestResult {
  rounds: LotofacilBacktestRound[];
  summary: BacktestSummary;
  strategy: {
    gameCount: number;
    fixedCount: 8 | 9 | 10;
    warmupContests: number;
  };
}

export function backtestLotofacil(
  contests: Contest[],
  options: LotofacilBacktestOptions = {},
): LotofacilBacktestResult {
  const gameCount = options.gameCount ?? 4;
  const fixedCount = options.fixedCount ?? 8;
  const warmupContests = options.warmupContests ?? 20;

  if (!Number.isInteger(gameCount) || gameCount < 1) {
    throw new Error("gameCount must be a positive integer");
  }
  if (![8, 9, 10].includes(fixedCount)) {
    throw new Error("Lotofacil fixedCount must be 8, 9 or 10");
  }
  if (!Number.isInteger(warmupContests) || warmupContests < 1) {
    throw new Error("warmupContests must be a positive integer");
  }

  const scoped = contests
    .filter((contest) => contest.lottery === "lotofacil")
    .sort((a, b) => a.number - b.number);
  const rounds: LotofacilBacktestRound[] = [];

  for (let index = warmupContests; index < scoped.length; index += 1) {
    const target = scoped[index]!;
    if (options.startContest !== undefined && target.number < options.startContest) continue;
    if (options.endContest !== undefined && target.number > options.endContest) continue;

    // Anti-leakage: the target draw and all future draws are invisible here.
    const history = scoped.slice(0, index);
    const generatedGames = generateLotofacilGames(history, { gameCount, fixedCount });
    const checks = evaluateGames(generatedGames, target);

    rounds.push({
      contest: target.number,
      date: target.date,
      targetNumbers: [...target.numbers],
      generatedGames,
      checks,
      bestHits: Math.max(...checks.map((check) => check.hits)),
      fixedHits: checks[0]?.fixedHits ?? 0,
    });
  }

  return {
    rounds,
    summary: summarizeBacktestRounds(rounds),
    strategy: { gameCount, fixedCount, warmupContests },
  };
}
