import type { Contest, GeneratedGame } from "../domain/types.js";
import { evaluateGames, type GameCheckResult } from "../checker/evaluate.js";
import { generateDiaDeSorteGames } from "../generator/diaDeSorte.js";
import { summarizeBacktestRounds, type BacktestSummary } from "./shared.js";

export interface DiaDeSorteBacktestOptions {
  gameCount?: number;
  warmupContests?: number;
  startContest?: number;
  endContest?: number;
}

export interface DiaDeSorteBacktestRound {
  contest: number;
  date: string;
  targetNumbers: number[];
  targetLuckyMonth?: string;
  generatedGames: GeneratedGame[];
  checks: GameCheckResult[];
  bestHits: number;
  fixedHits: number;
  luckyMonthHits: number;
}

export interface DiaDeSorteBacktestResult {
  rounds: DiaDeSorteBacktestRound[];
  summary: BacktestSummary & {
    luckyMonthHits: number;
    luckyMonthRate: number;
  };
  strategy: {
    gameCount: number;
    warmupContests: number;
  };
}

export function backtestDiaDeSorte(
  contests: Contest[],
  options: DiaDeSorteBacktestOptions = {},
): DiaDeSorteBacktestResult {
  const gameCount = options.gameCount ?? 4;
  const warmupContests = options.warmupContests ?? 20;

  if (!Number.isInteger(gameCount) || gameCount < 1) {
    throw new Error("gameCount must be a positive integer");
  }
  if (!Number.isInteger(warmupContests) || warmupContests < 1) {
    throw new Error("warmupContests must be a positive integer");
  }

  const scoped = contests
    .filter((contest) => contest.lottery === "dia-de-sorte")
    .sort((a, b) => a.number - b.number);
  const rounds: DiaDeSorteBacktestRound[] = [];

  for (let index = warmupContests; index < scoped.length; index += 1) {
    const target = scoped[index]!;
    if (options.startContest !== undefined && target.number < options.startContest) continue;
    if (options.endContest !== undefined && target.number > options.endContest) continue;

    // Anti-leakage: only draws before the target are visible to the generator.
    const history = scoped.slice(0, index);
    const generatedGames = generateDiaDeSorteGames(history, gameCount);
    const checks = evaluateGames(generatedGames, target);
    const luckyMonthHits = checks.filter((check) => check.luckyMonthHit).length;

    rounds.push({
      contest: target.number,
      date: target.date,
      targetNumbers: [...target.numbers],
      ...(target.luckyMonth ? { targetLuckyMonth: target.luckyMonth } : {}),
      generatedGames,
      checks,
      bestHits: Math.max(...checks.map((check) => check.hits)),
      fixedHits: checks[0]?.fixedHits ?? 0,
      luckyMonthHits,
    });
  }

  const baseSummary = summarizeBacktestRounds(rounds);
  const luckyMonthHits = rounds.reduce((total, round) => total + round.luckyMonthHits, 0);

  return {
    rounds,
    summary: {
      ...baseSummary,
      luckyMonthHits,
      luckyMonthRate: baseSummary.totalGames === 0 ? 0 : luckyMonthHits / baseSummary.totalGames,
    },
    strategy: { gameCount, warmupContests },
  };
}
