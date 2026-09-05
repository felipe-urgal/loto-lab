import type { Contest, LotteryId } from "../domain/types.js";
import { getLotteryConfig } from "../lotteries/config.js";

export interface GenerationRange {
  min: number;
  max: number;
}

export interface GenerationConstraints {
  odd?: GenerationRange;
  repeated?: GenerationRange;
  sum?: GenerationRange;
}

export interface GenerationBaseline {
  totalCombinations: number;
  expectedOdd: number;
  expectedRepeated: number | null;
  expectedSum: number;
  sumStdDev: number;
}

export interface GenerationAlgorithmSpace {
  fixedCount: number;
  variableCount: number;
  candidatePoolSize: number;
  rawCombinationCapacity: number;
  shortlistLimit: number;
}

export function combinationCount(n: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) return 0;
  const size = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= size; index += 1) {
    result = (result * (n - size + index)) / index;
  }
  return Math.round(result);
}

export function withinGenerationRange(value: number, range: GenerationRange | undefined): boolean {
  return !range || (value >= range.min && value <= range.max);
}

function populationStats(values: number[]): { mean: number; variance: number } {
  if (values.length === 0) return { mean: 0, variance: 0 };
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return { mean, variance };
}

export function buildConditionalBaseline(
  universe: number[],
  drawSize: number,
  fixed: number[],
  excluded: number[],
  referenceContest: Contest | undefined,
  totalCombinations: number,
): GenerationBaseline {
  const fixedSet = new Set(fixed);
  const excludedSet = new Set(excluded);
  const remaining = universe.filter((value) => !fixedSet.has(value) && !excludedSet.has(value));
  const needed = Math.max(0, drawSize - fixed.length);
  const fixedOdd = fixed.filter((value) => value % 2 !== 0).length;
  const remainingOdd = remaining.filter((value) => value % 2 !== 0).length;
  const fixedSum = fixed.reduce((total, value) => total + value, 0);
  const stats = populationStats(remaining);
  const sampleVariance = needed === 0 || remaining.length <= 1
    ? 0
    : needed * stats.variance * ((remaining.length - needed) / (remaining.length - 1));
  const referenceSet = new Set(referenceContest?.numbers ?? []);
  const fixedRepeated = fixed.filter((value) => referenceSet.has(value)).length;
  const remainingRepeated = remaining.filter((value) => referenceSet.has(value)).length;

  return {
    totalCombinations,
    expectedOdd: fixedOdd + (remaining.length === 0 ? 0 : needed * remainingOdd / remaining.length),
    expectedRepeated: referenceContest
      ? fixedRepeated + (remaining.length === 0 ? 0 : needed * remainingRepeated / remaining.length)
      : null,
    expectedSum: fixedSum + needed * stats.mean,
    sumStdDev: Math.sqrt(Math.max(0, sampleVariance)),
  };
}

interface DpState {
  picked: number;
  odd: number;
  repeated: number;
  sum: number;
}

function keyOf(state: DpState): string {
  return `${state.picked}|${state.odd}|${state.repeated}|${state.sum}`;
}

function parseKey(key: string): DpState {
  const [picked, odd, repeated, sum] = key.split("|").map(Number);
  return { picked: picked!, odd: odd!, repeated: repeated!, sum: sum! };
}

export function countEligibleGenerationCombinations(
  lottery: LotteryId,
  fixed: number[],
  excluded: number[],
  referenceContest: Contest | undefined,
  constraints: GenerationConstraints,
): number {
  const config = getLotteryConfig(lottery);
  const fixedSet = new Set(fixed);
  const excludedSet = new Set(excluded);
  const referenceSet = new Set(referenceContest?.numbers ?? []);
  const needed = config.drawSize - fixed.length;
  const candidates = Array.from(
    { length: config.maxNumber - config.minNumber + 1 },
    (_, index) => config.minNumber + index,
  ).filter((value) => !fixedSet.has(value) && !excludedSet.has(value));

  if (!constraints.odd && !constraints.repeated && !constraints.sum) {
    return combinationCount(candidates.length, needed);
  }

  const fixedOdd = fixed.filter((value) => value % 2 !== 0).length;
  const fixedRepeated = fixed.filter((value) => referenceSet.has(value)).length;
  const fixedSum = fixed.reduce((total, value) => total + value, 0);

  if (constraints.odd && fixedOdd > constraints.odd.max) return 0;
  if (constraints.repeated && fixedRepeated > constraints.repeated.max) return 0;
  if (constraints.sum && fixedSum > constraints.sum.max) return 0;

  let states = new Map<string, number>([[keyOf({ picked: 0, odd: fixedOdd, repeated: fixedRepeated, sum: fixedSum }), 1]]);

  for (const value of candidates) {
    const next = new Map(states);
    for (const [key, count] of states) {
      const state = parseKey(key);
      if (state.picked >= needed) continue;
      const candidate: DpState = {
        picked: state.picked + 1,
        odd: state.odd + (value % 2 !== 0 ? 1 : 0),
        repeated: state.repeated + (referenceSet.has(value) ? 1 : 0),
        sum: state.sum + value,
      };
      if (constraints.odd && candidate.odd > constraints.odd.max) continue;
      if (constraints.repeated && candidate.repeated > constraints.repeated.max) continue;
      if (constraints.sum && candidate.sum > constraints.sum.max) continue;
      const candidateKey = keyOf(candidate);
      next.set(candidateKey, (next.get(candidateKey) ?? 0) + count);
    }
    states = next;
  }

  let total = 0;
  for (const [key, count] of states) {
    const state = parseKey(key);
    if (state.picked !== needed) continue;
    if (!withinGenerationRange(state.odd, constraints.odd)) continue;
    if (!withinGenerationRange(state.repeated, constraints.repeated)) continue;
    if (!withinGenerationRange(state.sum, constraints.sum)) continue;
    total += count;
  }
  return total;
}

function algorithmPoolLimit(lottery: LotteryId, fixedCount: number): number {
  if (lottery === "lotofacil") return Number.POSITIVE_INFINITY;
  if (lottery === "mega-sena") return fixedCount === 0 ? 14 : fixedCount === 2 ? 18 : 24;
  return fixedCount === 0 ? 13 : fixedCount === 2 ? 14 : 18;
}

export function buildGenerationAlgorithmSpaces(
  lottery: LotteryId,
  fixedCountOptions: number[],
  universeSize: number,
  drawSize: number,
  manualFixedCount: number,
  excludedCount: number,
): Record<string, GenerationAlgorithmSpace> {
  const result: Record<string, GenerationAlgorithmSpace> = {};
  for (const fixedCount of fixedCountOptions) {
    const variableCount = drawSize - fixedCount;
    const availableAfterCore = Math.max(0, universeSize - excludedCount - fixedCount);
    const poolLimit = algorithmPoolLimit(lottery, fixedCount);
    const candidatePoolSize = manualFixedCount > fixedCount
      ? 0
      : Math.min(availableAfterCore, poolLimit);
    const rawCombinationCapacity = combinationCount(candidatePoolSize, variableCount);
    result[String(fixedCount)] = {
      fixedCount,
      variableCount,
      candidatePoolSize,
      rawCombinationCapacity,
      shortlistLimit: Math.min(24, rawCombinationCapacity),
    };
  }
  return result;
}
