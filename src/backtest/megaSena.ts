import type { Contest, GeneratedGame } from "../domain/types.js";
import { evaluateGames, type GameCheckResult } from "../checker/evaluate.js";
import {
  generateMegaSenaGames,
  type MegaSenaFixedCount,
} from "../generator/megaSena.js";
import { summarizeBacktestRounds, type BacktestSummary } from "./shared.js";

export interface MegaSenaBacktestOptions {
  gameCount?: number;
  fixedCount?: MegaSenaFixedCount;
  warmupContests?: number;
  startContest?: number;
  endContest?: number;
}

export interface MegaSenaBacktestRound {
  contest: number;
  date: string;
  targetNumbers: number[];
  generatedGames: GeneratedGame[];
  checks: GameCheckResult[];
  hitsByGame: number[];
  bestHits: number;
  fixedHits: number;
}

export interface MegaSenaBacktestResult {
  rounds: MegaSenaBacktestRound[];
  summary: BacktestSummary;
  strategy: {
    gameCount: number;
    fixedCount: MegaSenaFixedCount;
    warmupContests: number;
  };
}

export function backtestMegaSena(
  contests: Contest[],
  options: MegaSenaBacktestOptions = {},
): MegaSenaBacktestResult {
  const gameCount = options.gameCount ?? 2;
  const fixedCount = options.fixedCount ?? 3;
  const warmupContests = options.warmupContests ?? 20;

  if (!Number.isInteger(gameCount) || gameCount < 1) {
    throw new Error("gameCount must be a positive integer");
  }
  if (![0, 2, 3].includes(fixedCount)) {
    throw new Error("Mega-Sena fixedCount must be 0, 2 or 3");
  }
  if (!Number.isInteger(warmupContests) || warmupContests < 1) {
    throw new Error("warmupContests must be a positive integer");
  }

  const scoped = contests
    .filter((contest) => contest.lottery === "mega-sena")
    .sort((a, b) => a.number - b.number);
  const rounds: MegaSenaBacktestRound[] = [];

  for (let index = warmupContests; index < scoped.length; index += 1) {
    const target = scoped[index]!;
    if (options.startContest !== undefined && target.number < options.startContest) continue;
    if (options.endContest !== undefined && target.number > options.endContest) continue;

    // Anti-leakage: only draws before the target are visible to the generator.
    const history = scoped.slice(0, index);
    const generatedGames = generateMegaSenaGames(history, { gameCount, fixedCount });
    const checks = evaluateGames(generatedGames, target);
    const hitsByGame = checks.map((check) => check.hits);

    rounds.push({
      contest: target.number,
      date: target.date,
      targetNumbers: [...target.numbers],
      generatedGames,
      checks,
      hitsByGame,
      bestHits: Math.max(...hitsByGame),
      fixedHits: checks[0]?.fixedHits ?? 0,
    });
  }

  return {
    rounds,
    summary: summarizeBacktestRounds(rounds),
    strategy: { gameCount, fixedCount, warmupContests },
  };
}
