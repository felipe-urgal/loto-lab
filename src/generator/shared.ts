import type { Contest, GeneratedGame, NumberAnalysis } from "../domain/types.js";

export type GenerationMode = "deterministic" | "diversified";
export type NumberTieBreaker = (left: number, right: number) => number;

export interface RankedCandidate {
  rank: number;
}

export const GENERATION_POLICY = {
  megaSena: {
    parityPenalty: 20,
    repeatExcessPenalty: 30,
    variableReusePenalty: 80,
  },
  lotofacil: {
    repeatDistancePenalty: 35,
    parityDistancePenalty: 22,
    variableReusePenalty: 28,
  },
  diaDeSorte: {
    repeatDistancePenalty: 35,
    parityDistancePenalty: 22,
    sumDistancePenalty: 0.25,
    variableReusePenalty: 45,
  },
} as const;

export function* combinationIterator<T>(items: T[], size: number): Generator<T[]> {
  if (!Number.isInteger(size) || size < 0 || size > items.length) return;

  function* walk(start: number, current: T[]): Generator<T[]> {
    if (current.length === size) {
      yield [...current];
      return;
    }
    const remaining = size - current.length;
    const lastStart = items.length - remaining;
    for (let index = start; index <= lastStart; index += 1) {
      current.push(items[index]!);
      yield* walk(index + 1, current);
      current.pop();
    }
  }
  yield* walk(0, []);
}

export function combinations<T>(items: T[], size: number): T[][] {
  return [...combinationIterator(items, size)];
}

export function topRankedCandidates<T extends RankedCandidate>(
  candidates: Iterable<T>,
  limit = 24,
  compare: (a: T, b: T) => number = (a, b) => b.rank - a.rank,
): T[] {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("candidate limit must be positive");
  const heap: T[] = [];
  const isWorse = (left: T, right: T) => compare(left, right) > 0;

  const siftUp = (start: number) => {
    let index = start;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!isWorse(heap[index]!, heap[parent]!)) break;
      [heap[index], heap[parent]] = [heap[parent]!, heap[index]!];
      index = parent;
    }
  };
  const siftDown = (start: number) => {
    let index = start;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let worst = index;
      if (left < heap.length && isWorse(heap[left]!, heap[worst]!)) worst = left;
      if (right < heap.length && isWorse(heap[right]!, heap[worst]!)) worst = right;
      if (worst === index) break;
      [heap[index], heap[worst]] = [heap[worst]!, heap[index]!];
      index = worst;
    }
  };

  for (const candidate of candidates) {
    if (heap.length < limit) {
      heap.push(candidate);
      siftUp(heap.length - 1);
      continue;
    }
    if (compare(candidate, heap[0]!) >= 0) continue;
    heap[0] = candidate;
    siftDown(0);
  }
  return heap.sort(compare);
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

export function buildStratifiedCandidatePool(
  analysis: NumberAnalysis[],
  fixedSet: Set<number>,
  excludedSet: Set<number>,
  limit: number,
  tieBreaker?: NumberTieBreaker,
): number[] {
  if (!Number.isInteger(limit) || limit < 1) return [];
  const available = analysis
    .filter((row) => !fixedSet.has(row.number) && !excludedSet.has(row.number))
    .sort((a, b) => b.score - a.score || (tieBreaker ? tieBreaker(a.number, b.number) : a.number - b.number));
  if (available.length <= limit) return available.map((row) => row.number);

  const selected = new Set<number>();
  const quotas = {
    strong: Math.max(1, Math.floor(limit * 0.5)),
    balanced: Math.max(1, Math.floor(limit * 0.35)),
    cold: Math.max(1, Math.floor(limit * 0.15)),
  } as const;

  for (const tier of ["strong", "balanced", "cold"] as const) {
    let added = 0;
    for (const row of available) {
      if (row.tier !== tier || selected.has(row.number)) continue;
      selected.add(row.number);
      added += 1;
      if (added >= quotas[tier] || selected.size >= limit) break;
    }
  }
  for (const row of available) {
    if (selected.size >= limit) break;
    selected.add(row.number);
  }
  return [...selected];
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
  presetNumbers: number[] = [],
  excludedNumbers: number[] = [],
  tieBreaker?: NumberTieBreaker,
): number[] {
  if (!Number.isInteger(count) || count < 1 || count > analysis.length) throw new Error("Invalid fixed-number count");
  if (!Number.isInteger(maxRepeatedFromLastContest) || maxRepeatedFromLastContest < 0 || maxRepeatedFromLastContest > count) {
    throw new Error("Invalid fixed-core repeat limit");
  }

  const available = new Set(analysis.map((row) => row.number));
  const excluded = new Set(excludedNumbers);
  const selected = new Set<number>(presetNumbers);
  if (selected.size !== presetNumbers.length) throw new Error("Fixed numbers must be unique");
  if (selected.size > count) throw new Error("Manual fixed numbers exceed the configured fixed core");
  if ([...selected].some((number) => !available.has(number))) throw new Error("Manual fixed number is outside the lottery universe");
  if ([...selected].some((number) => excluded.has(number))) throw new Error("A number cannot be fixed and excluded at the same time");
  if ([...excluded].some((number) => !available.has(number))) throw new Error("Excluded number is outside the lottery universe");
  if (lastContest) {
    const presetRepeats = [...selected].filter((number) => lastContest.numbers.includes(number)).length;
    if (presetRepeats > maxRepeatedFromLastContest) throw new Error("Manual fixed numbers exceed the fixed-core repeat limit");
  }

  function pick(value: (row: NumberAnalysis) => number): void {
    const selectedRepeats = lastContest
      ? [...selected].filter((number) => lastContest.numbers.includes(number)).length
      : 0;
    const ranked = [...analysis]
      .filter((row) => {
        if (selected.has(row.number) || excluded.has(row.number)) return false;
        if (!lastContest) return true;
        if (selectedRepeats < maxRepeatedFromLastContest) return true;
        return !lastContest.numbers.includes(row.number);
      })
      .sort((a, b) => value(b) - value(a) || b.score - a.score || (tieBreaker ? tieBreaker(a.number, b.number) : a.number - b.number));
    const candidate = random ? selectWeightedItem(ranked, random, 6) : ranked[0];
    if (!candidate) throw new Error("Unable to select fixed number");
    selected.add(candidate.number);
  }

  if (selected.size < count) pick((row) => row.year);
  if (selected.size < count) pick((row) => row.historical * 0.5 + row.year * 0.5);
  if (selected.size < count) pick((row) => row.recent10 * 0.6 + row.month * 0.4);
  while (selected.size < count) {
    pick((row) => row.score + (lastContest?.numbers.includes(row.number) ? 8 : 0));
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

export function createStableNumberTieBreaker(seed: string): NumberTieBreaker {
  const cache = new Map<number, number>();
  const valueFor = (number: number) => {
    const cached = cache.get(number);
    if (cached !== undefined) return cached;
    const value = hashSeed(`${seed}:${number}`);
    cache.set(number, value);
    return value;
  };
  return (left, right) => valueFor(left) - valueFor(right) || left - right;
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
  if (!seed || seed.trim().length === 0) throw new Error("A seed is required for diversified generation");
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
