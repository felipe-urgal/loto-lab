import type { Contest, GeneratedGame } from "../domain/types.js";
import { generateMegaSenaGames } from "../generator/megaSena.js";

export interface MegaSenaBacktestOptions {
  gameCount?: number;
  warmupContests?: number;
  startContest?: number;
  endContest?: number;
}

export interface MegaSenaBacktestRound {
  contest: number;
  date: string;
  targetNumbers: number[];
  generatedGames: GeneratedGame[];
  hitsByGame: number[];
  bestHits: number;
  fixedHits: number;
}

export interface MegaSenaBacktestSummary {
  testedContests: number;
  totalGames: number;
  averageHitsPerGame: number;
  maxHits: number;
  bestHitDistribution: Record<number, number>;
  fixedHitDistribution: Record<number, number>;
}

export interface MegaSenaBacktestResult {
  rounds: MegaSenaBacktestRound[];
  summary: MegaSenaBacktestSummary;
}

function hits(numbers: number[], target: number[]): number {
  const targetSet = new Set(target);
  return numbers.filter((number) => targetSet.has(number)).length;
}

function increment(distribution: Record<number, number>, value: number): void {
  distribution[value] = (distribution[value] ?? 0) + 1;
}

export function backtestMegaSena(
  contests: Contest[],
  options: MegaSenaBacktestOptions = {},
): MegaSenaBacktestResult {
  const gameCount = options.gameCount ?? 2;
  const warmupContests = options.warmupContests ?? 20;

  if (!Number.isInteger(gameCount) || gameCount < 1) {
    throw new Error("gameCount must be a positive integer");
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

    // Anti-leakage rule: only contests that existed before the target draw
    // are visible to the generator. The target and every future draw are excluded.
    const history = scoped.slice(0, index);
    const generatedGames = generateMegaSenaGames(history, gameCount);
    const hitsByGame = generatedGames.map((game) => hits(game.numbers, target.numbers));
    const fixedNumbers = generatedGames[0]?.fixedNumbers ?? [];

    rounds.push({
      contest: target.number,
      date: target.date,
      targetNumbers: [...target.numbers],
      generatedGames,
      hitsByGame,
      bestHits: Math.max(...hitsByGame),
      fixedHits: hits(fixedNumbers, target.numbers),
    });
  }

  const bestHitDistribution: Record<number, number> = {};
  const fixedHitDistribution: Record<number, number> = {};
  let totalHits = 0;
  let totalGames = 0;
  let maxHits = 0;

  for (const round of rounds) {
    increment(bestHitDistribution, round.bestHits);
    increment(fixedHitDistribution, round.fixedHits);
    for (const gameHits of round.hitsByGame) {
      totalHits += gameHits;
      totalGames += 1;
      maxHits = Math.max(maxHits, gameHits);
    }
  }

  return {
    rounds,
    summary: {
      testedContests: rounds.length,
      totalGames,
      averageHitsPerGame: totalGames === 0 ? 0 : totalHits / totalGames,
      maxHits,
      bestHitDistribution,
      fixedHitDistribution,
    },
  };
}
