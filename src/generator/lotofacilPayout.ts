import type { Contest, GeneratedGame } from "../domain/types.js";
import { getLotteryConfig } from "../lotteries/config.js";
import { matchesGenerationConstraints, type GenerationConstraints } from "./planning.js";
import { partitionPayoutCore } from "./payoutPartition.js";
import { buildMetadata, createSeededRandom } from "./shared.js";
import { selectDiversifiedBatch } from "./payoutSelection.js";
import { evaluateLotofacilTicket, LOTOFACIL_MODEL } from "./lotofacilModel.js";

const config = getLotteryConfig("lotofacil");
const POOL_SIZE = 1_500;
const GUIDE_SHARPNESS = 6;
const INITIAL_OVERLAP_CAP = 12;

export interface LotofacilPayoutOptions {
  gameCount: number;
  fixedCount: number;
  seed: string;
  fixedNumbers?: number[];
  excludedNumbers?: number[];
  constraints?: GenerationConstraints;
  referenceContest?: Contest;
}

export interface LotofacilPayoutReport {
  strategy: "lotofacil-payout-v1";
  model: string;
  fitThroughContest: number;
  /** Retorno esperado relativo a um jogo uniforme (1,00) por jogo. */
  evIndex: number[];
  averageEvIndex: number;
  /** Índice de co-ganhadores em 14/15 acertos por jogo (1,00 = uniforme). */
  shareIndex: number[];
  /** P(11+ acertos) modelada por jogo (uniforme ≈ 0,106). */
  hitRate11: number[];
  maxPairOverlap: number;
  poolSize: number;
}

/** Guia marginal por dezena: viés de frequência a favor, popularidade contra. */
const guide = LOTOFACIL_MODEL.theta.map(
  (theta, index) => GUIDE_SHARPNESS * (theta - LOTOFACIL_MODEL.shareCoefficient * LOTOFACIL_MODEL.popularity[index]!),
);

function sampleGuided(allowed: number[], count: number, random: () => number): number[] {
  const pool = allowed.map((number) => ({ number, weight: Math.exp(guide[number - 1]!) }));
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

export function generateLotofacilPayoutGames(options: LotofacilPayoutOptions): {
  games: GeneratedGame[];
  report: LotofacilPayoutReport;
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

  const random = createSeededRandom(`lotofacil-payout:${options.seed}`);
  const open = universe.filter((number) => !excluded.has(number) && !fixed.includes(number));
  if (open.length < config.drawSize - fixed.length) throw new Error("Too many excluded numbers for the requested bet size");
  const core = [...fixed, ...sampleGuided(open, options.fixedCount - fixed.length, random)].sort((a, b) => a - b);
  const variablePool = open.filter((number) => !core.includes(number));
  const variableCount = config.drawSize - core.length;

  const seen = new Set<string>();
  const pool: { numbers: number[]; variable: number[]; ev: number }[] = [];
  for (let attempt = 0; pool.length < POOL_SIZE && attempt < POOL_SIZE * 8; attempt += 1) {
    const variable = sampleGuided(variablePool, variableCount, random).sort((a, b) => a - b);
    const numbers = [...core, ...variable].sort((a, b) => a - b);
    const key = numbers.join("-");
    if (seen.has(key)) continue;
    seen.add(key);
    const game: GeneratedGame = {
      lottery: "lotofacil",
      numbers,
      fixedNumbers: core,
      variableNumbers: variable,
      metadata: buildMetadata(numbers, options.referenceContest, true),
    };
    if (!matchesGenerationConstraints(game, options.constraints)) continue;
    pool.push({ numbers, variable, ev: evaluateLotofacilTicket(numbers).evIndex });
  }
  if (pool.length < options.gameCount) throw new Error("Unable to sample enough unique games with the requested constraints");
  pool.sort((a, b) => b.ev - a.ev || a.numbers.join("-").localeCompare(b.numbers.join("-")));

  // O EV é aditivo entre jogos; limitar a sobreposição só reduz a variância do lote.
  const selected = selectDiversifiedBatch(pool, options.gameCount, random, Math.max(INITIAL_OVERLAP_CAP, core.length), config.drawSize - 1);
  if (!selected) throw new Error("Unable to build a low-overlap portfolio with the requested constraints");

  const games: GeneratedGame[] = selected.map((entry) => ({
    lottery: "lotofacil",
    numbers: entry.numbers,
    ...partitionPayoutCore("lotofacil", entry.numbers, core),
    metadata: buildMetadata(entry.numbers, options.referenceContest, true),
  }));
  let maxPairOverlap = 0;
  for (let left = 0; left < selected.length; left += 1) {
    for (let right = left + 1; right < selected.length; right += 1) {
      maxPairOverlap = Math.max(maxPairOverlap, overlapOf(selected[left]!.numbers, selected[right]!.numbers));
    }
  }
  const evaluations = selected.map((entry) => evaluateLotofacilTicket(entry.numbers));
  const round = (value: number) => Number(value.toFixed(3));
  const evIndex = evaluations.map((entry) => round(entry.evIndex));
  return {
    games,
    report: {
      strategy: "lotofacil-payout-v1",
      model: LOTOFACIL_MODEL.id,
      fitThroughContest: LOTOFACIL_MODEL.fitThroughContest,
      evIndex,
      averageEvIndex: round(evIndex.reduce((sum, value) => sum + value, 0) / evIndex.length),
      shareIndex: evaluations.map((entry) => round(entry.shareIndex)),
      hitRate11: evaluations.map((entry) => round(entry.hitRate11)),
      maxPairOverlap,
      poolSize: pool.length,
    },
  };
}
