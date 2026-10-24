import type { Contest, GeneratedGame } from "../domain/types.js";
import { getLotteryConfig } from "../lotteries/config.js";
import { matchesGenerationConstraints, type GenerationConstraints } from "./planning.js";
import { buildMetadata, createSeededRandom } from "./shared.js";
import {
  MEGA_POPULARITY_MODEL,
  megaSenaPopularityScore,
  megaSenaPopularityWeight,
  megaSenaShareIndex,
} from "./megaSenaPopularity.js";

const config = getLotteryConfig("mega-sena");
const POOL_SIZE = 20_000;
const TILT = 1.5 * MEGA_POPULARITY_MODEL.shareCoefficient;
const MAX_OVERLAP_CAP = 5;

export interface MegaSenaPayoutOptions {
  gameCount: number;
  fixedCount: number;
  seed: string;
  fixedNumbers?: number[];
  excludedNumbers?: number[];
  constraints?: GenerationConstraints;
  referenceContest?: Contest;
}

export interface MegaSenaPayoutReport {
  strategy: "mega-sena-payout-v1";
  popularityModel: string;
  fitThroughContest: number;
  /** Índice relativo de co-ganhadores por jogo (1,00 = sena uniforme). */
  shareIndex: number[];
  averageShareIndex: number;
  maxPairOverlap: number;
  poolSize: number;
}

function sampleTilted(allowed: number[], count: number, random: () => number): number[] {
  const pool = allowed.map((number) => ({ number, weight: Math.exp(-TILT * megaSenaPopularityWeight(number)) }));
  const picked: number[] = [];
  for (let step = 0; step < count; step += 1) {
    const total = pool.reduce((sum, item) => sum + item.weight, 0);
    let cursor = random() * total;
    let index = 0;
    for (; index < pool.length - 1; index += 1) {
      cursor -= pool[index]!.weight;
      if (cursor < 0) break;
    }
    picked.push(pool.splice(index, 1)[0]!.number);
  }
  return picked;
}

function overlapOf(left: number[], right: number[]): number {
  return left.filter((number) => right.includes(number)).length;
}

export function generateMegaSenaPayoutGames(options: MegaSenaPayoutOptions): {
  games: GeneratedGame[];
  report: MegaSenaPayoutReport;
} {
  const fixed = [...(options.fixedNumbers ?? [])];
  const excluded = new Set(options.excludedNumbers ?? []);
  const universe = Array.from({ length: config.maxNumber - config.minNumber + 1 }, (_, index) => config.minNumber + index);
  if (!Number.isInteger(options.gameCount) || options.gameCount < 1) throw new Error("gameCount must be a positive integer");
  if (!Number.isInteger(options.fixedCount) || options.fixedCount < 0 || options.fixedCount > config.drawSize) {
    throw new Error("fixedCount must fit inside the bet size");
  }
  if (fixed.length > options.fixedCount) throw new Error("Manual fixed numbers exceed the configured fixed core");
  if (new Set(fixed).size !== fixed.length) throw new Error("Fixed numbers must be unique");
  if (fixed.some((number) => !universe.includes(number)) || [...excluded].some((number) => !universe.includes(number))) {
    throw new Error("Fixed or excluded number is outside the lottery universe");
  }
  if (fixed.some((number) => excluded.has(number))) throw new Error("A number cannot be fixed and excluded at the same time");

  const random = createSeededRandom(`payout:${options.seed}`);
  const open = universe.filter((number) => !excluded.has(number) && !fixed.includes(number));
  if (open.length < config.drawSize - fixed.length) throw new Error("Too many excluded numbers for the requested bet size");
  const core = [...fixed, ...sampleTilted(open, options.fixedCount - fixed.length, random)].sort((a, b) => a - b);
  const variablePool = open.filter((number) => !core.includes(number));
  const variableCount = config.drawSize - core.length;

  const seen = new Set<string>();
  const pool: { numbers: number[]; variable: number[]; score: number }[] = [];
  for (let attempt = 0; pool.length < POOL_SIZE && attempt < POOL_SIZE * 4; attempt += 1) {
    const variable = sampleTilted(variablePool, variableCount, random).sort((a, b) => a - b);
    const numbers = [...core, ...variable].sort((a, b) => a - b);
    const key = numbers.join("-");
    if (seen.has(key)) continue;
    seen.add(key);
    const game: GeneratedGame = {
      lottery: "mega-sena",
      numbers,
      fixedNumbers: core,
      variableNumbers: variable,
      metadata: buildMetadata(numbers, options.referenceContest, false),
    };
    if (!matchesGenerationConstraints(game, options.constraints)) continue;
    pool.push({ numbers, variable, score: megaSenaPopularityScore(numbers) });
  }
  if (pool.length < options.gameCount) throw new Error("Unable to sample enough unique games with the requested constraints");
  pool.sort((a, b) => a.score - b.score || a.numbers.join("-").localeCompare(b.numbers.join("-")));

  // Lote com sobreposição limitada: dois jogos com 4+ dezenas em comum disputam os mesmos prêmios menores.
  const selected: typeof pool = [];
  let cap = Math.max(2, core.length);
  while (selected.length < options.gameCount) {
    const next = pool.find((candidate) =>
      !selected.includes(candidate) && selected.every((game) => overlapOf(game.numbers, candidate.numbers) <= cap));
    if (next) {
      selected.push(next);
    } else if (cap < MAX_OVERLAP_CAP) {
      cap += 1;
    } else {
      throw new Error("Unable to build a low-overlap portfolio with the requested constraints");
    }
  }

  const games: GeneratedGame[] = selected.map((entry) => ({
    lottery: "mega-sena",
    numbers: entry.numbers,
    fixedNumbers: [...core],
    variableNumbers: entry.variable,
    metadata: buildMetadata(entry.numbers, options.referenceContest, false),
  }));
  let maxPairOverlap = 0;
  for (let left = 0; left < selected.length; left += 1) {
    for (let right = left + 1; right < selected.length; right += 1) {
      maxPairOverlap = Math.max(maxPairOverlap, overlapOf(selected[left]!.numbers, selected[right]!.numbers));
    }
  }
  const shareIndex = selected.map((entry) => Number(megaSenaShareIndex(entry.numbers).toFixed(3)));
  return {
    games,
    report: {
      strategy: "mega-sena-payout-v1",
      popularityModel: MEGA_POPULARITY_MODEL.id,
      fitThroughContest: MEGA_POPULARITY_MODEL.fitThroughContest,
      shareIndex,
      averageShareIndex: Number((shareIndex.reduce((sum, value) => sum + value, 0) / shareIndex.length).toFixed(3)),
      maxPairOverlap,
      poolSize: pool.length,
    },
  };
}
