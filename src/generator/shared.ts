import type { Contest, GeneratedGame, NumberAnalysis } from "../domain/types.js";

export type GenerationMode = "deterministic" | "diversified";

export interface RankedCandidate {
  rank: number;
}

export function combinations<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  function walk(start: number, current: T[]): void {
    if (current.length === size) {
      result.push([...current]);
      return;
    }

    for (let index = start; index < items.length; index += 1) {
      current.push(items[index]!);
      walk(index + 1, current);
      current.pop();
    }
  }

  walk(0, []);
  return result;
}

export function buildMetadata(
  numbers: number[],
  lastContest?: Contest,
  includeGrid = false,
): GeneratedGame["metadata"] {
  const odd = numbers.filter((number) => number % 2 !== 0).length;
  const repeatedFromLastContest = lastContest
    ? numbers.filter((number) => lastContest.numbers.includes(number))
    : [];

  const metadata: GeneratedGame["metadata"] = {
    odd,
    even: numbers.length - odd,
    sum: numbers.reduce((total, number) => total + number, 0),
    repeatedFromLastContest,
  };

  if (includeGrid) {
    metadata.lineDistribution = Array.from({ length: 5 }, (_, index) =>
      numbers.filter((number) => Math.floor((number - 1) / 5) === index).length,
    );
    metadata.columnDistribution = Array.from({ length: 5 }, (_, index) =>
      numbers.filter((number) => (number - 1) % 5 === index).length,
    );
  }

  return metadata;
}

export function scoreMap(analysis: NumberAnalysis[]): Map<number, number> {
  return new Map(analysis.map((row) => [row.number, row.score]));
}

export function selectWeightedItem<T>(
  ranked: T[],
  random: () => number,
  poolSize = 6,
): T | undefined {
  if (ranked.length === 0) return undefined;
  const pool = ranked.slice(0, Math.max(1, Math.min(poolSize, ranked.length)));
  const totalWeight = pool.reduce((sum, _candidate, index) => sum + (pool.length - index), 0);
  let cursor = random() * totalWeight;

  for (let index = 0; index < pool.length; index += 1) {
    cursor -= pool.length - index;
    if (cursor < 0) return pool[index];
  }

  return pool[0];
}

export function selectProfiledFixedNumbers(
  analysis: NumberAnalysis[],
  count: number,
  lastContest?: Contest,
  maxRepeatedFromLastContest = count,
  random?: () => number,
): number[] {
  if (!Number.isInteger(count) || count < 1 || count > analysis.length) {
    throw new Error("Invalid fixed-number count");
  }
  if (
    !Number.isInteger(maxRepeatedFromLastContest) ||
    maxRepeatedFromLastContest < 0 ||
    maxRepeatedFromLastContest > count
  ) {
    throw new Error("Invalid fixed-core repeat limit");
  }

  const selected = new Set<number>();

  function pick(value: (row: NumberAnalysis) => number): void {
    const selectedRepeats = lastContest
      ? [...selected].filter((number) => lastContest.numbers.includes(number)).length
      : 0;
    const ranked = [...analysis]
      .filter((row) => {
        if (selected.has(row.number)) return false;
        if (!lastContest) return true;
        if (selectedRepeats < maxRepeatedFromLastContest) return true;
        return !lastContest.numbers.includes(row.number);
      })
      .sort((a, b) => value(b) - value(a) || b.score - a.score || a.number - b.number);
    const candidate = random ? selectWeightedItem(ranked, random, 6) : ranked[0];

    if (!candidate) throw new Error("Unable to select fixed number");
    selected.add(candidate.number);
  }

  pick((row) => row.year);
  if (selected.size < count) pick((row) => row.historical * 0.5 + row.year * 0.5);
  if (selected.size < count) pick((row) => row.recent10 * 0.6 + row.month * 0.4);

  while (selected.size < count) {
    pick((row) => {
      const repeatBonus = lastContest?.numbers.includes(row.number) ? 8 : 0;
      return row.score + repeatBonus;
    });
  }

  return [...selected].sort((a, b) => a - b);
}

export function gridExtremePenalty(distribution?: number[]): number {
  if (!distribution) return 0;
  return distribution.reduce((penalty, count) => {
    if (count === 0) return penalty + 8;
    if (count > 4) return penalty + (count - 4) * 15;
    return penalty;
  }, 0);
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed: string): () => number {
  let state = hashSeed(seed) || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function generationRandom(
  mode: GenerationMode,
  seed?: string,
): (() => number) | undefined {
  if (mode === "deterministic") return undefined;
  if (!seed || seed.trim().length === 0) {
    throw new Error("A seed is required for diversified generation");
  }
  return createSeededRandom(seed);
}

export function selectRankedCandidate<T extends RankedCandidate>(
  ranked: T[],
  mode: GenerationMode,
  random?: () => number,
  poolSize = 6,
): T | undefined {
  if (ranked.length === 0) return undefined;
  if (mode === "deterministic") return ranked[0];
  if (!random) throw new Error("Diversified generation requires a seeded random source");

  const diversifiedPoolSize = Math.max(poolSize, 24);
  const pool = ranked.slice(0, Math.max(1, Math.min(diversifiedPoolSize, ranked.length)));
  const totalWeight = pool.reduce((sum, _candidate, index) => sum + (pool.length - index), 0);
  let cursor = random() * totalWeight;

  for (let index = 0; index < pool.length; index += 1) {
    cursor -= pool.length - index;
    if (cursor < 0) return pool[index];
  }

  return pool[0];
}
