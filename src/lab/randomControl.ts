import type { Contest, GeneratedGame, LotteryId } from "../domain/types.js";
import { eligibleTargetIndexes } from "../analysis/contestEligibility.js";
import { evaluateGames, type GameCheckResult } from "../checker/evaluate.js";
import { summarizeBacktestRounds, type BacktestSummary } from "../backtest/shared.js";
import { getLotteryConfig } from "../lotteries/config.js";
import { buildMetadata, createSeededRandom } from "../generator/shared.js";

const LUCKY_MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

export interface RandomControlOptions {
  lottery: LotteryId;
  gameCount: number;
  warmupContests: number;
  startContest?: number;
  endContest?: number;
  seed?: string;
}

export interface RandomControlRound {
  contest: number;
  date: string;
  checks: GameCheckResult[];
}

export interface RandomControlResult {
  rounds: RandomControlRound[];
  summary: BacktestSummary;
}

export interface RandomControlSample {
  seed: string;
  summary: BacktestSummary;
}

function sampleNumbers(lottery: LotteryId, random: () => number): number[] {
  const config = getLotteryConfig(lottery);
  const pool = Array.from(
    { length: config.maxNumber - config.minNumber + 1 },
    (_, index) => config.minNumber + index,
  );
  const selected: number[] = [];
  while (selected.length < config.drawSize) {
    const index = Math.floor(random() * pool.length);
    selected.push(pool.splice(index, 1)[0]!);
  }
  return selected.sort((a, b) => a - b);
}

function randomGame(
  lottery: LotteryId,
  contestNumber: number,
  gameIndex: number,
  seed: string,
  lastContest?: Contest,
): GeneratedGame {
  const random = createSeededRandom(`${seed}:${lottery}:${contestNumber}:${gameIndex}`);
  const numbers = sampleNumbers(lottery, random);
  const game: GeneratedGame = {
    lottery,
    numbers,
    fixedNumbers: [],
    variableNumbers: [...numbers],
    metadata: buildMetadata(numbers, lastContest, lottery === "lotofacil"),
  };
  if (lottery === "dia-de-sorte") {
    game.luckyMonth = LUCKY_MONTHS[Math.floor(random() * LUCKY_MONTHS.length)]!;
  }
  return game;
}

export function backtestRandomControl(
  contests: Contest[],
  options: RandomControlOptions,
): RandomControlResult {
  const scoped = contests
    .filter((contest) => contest.lottery === options.lottery)
    .sort((a, b) => a.number - b.number);
  const rounds: RandomControlRound[] = [];
  const seed = options.seed ?? "loto-lab-random-control-v1";
  const targetIndexes = eligibleTargetIndexes(scoped, {
    warmupContests: options.warmupContests,
    ...(options.startContest !== undefined ? { startContest: options.startContest } : {}),
    ...(options.endContest !== undefined ? { endContest: options.endContest } : {}),
  });

  for (const index of targetIndexes) {
    const target = scoped[index]!;
    const lastContest = scoped[index - 1]!;
    const games = Array.from({ length: options.gameCount }, (_, gameIndex) =>
      randomGame(options.lottery, target.number, gameIndex, seed, lastContest),
    );
    const checks = evaluateGames(games, target);
    rounds.push({ contest: target.number, date: target.date, checks });
  }

  return {
    rounds,
    summary: summarizeBacktestRounds(rounds),
  };
}

export function sampleRandomControls(
  contests: Contest[],
  options: Omit<RandomControlOptions, "seed">,
  samples = 100,
  seedPrefix = "loto-lab-random-distribution-v2",
): RandomControlSample[] {
  if (!Number.isInteger(samples) || samples < 10 || samples > 500) {
    throw new Error("randomSamples must be an integer between 10 and 500");
  }
  return Array.from({ length: samples }, (_, index) => {
    const seed = `${seedPrefix}:${index + 1}`;
    const result = backtestRandomControl(contests, { ...options, seed });
    return { seed, summary: result.summary };
  });
}
