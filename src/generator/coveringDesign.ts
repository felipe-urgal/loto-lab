import type { Contest, GeneratedGame, LotteryId } from "../domain/types.js";
import { getLotteryConfig } from "../lotteries/config.js";
import { matchesGenerationConstraints, type GenerationConstraints } from "./planning.js";
import { buildMetadata } from "./shared.js";

export const COVERING_DESIGN_VERSION = "greedy-set-cover-v1";
export const MAX_COVERAGE_CANDIDATES = 200_000;
export const MAX_COVERAGE_TARGETS = 200_000;
export const MAX_COVERAGE_INCIDENCES = 2_000_000;

export interface CoveringDesignOptions {
  lottery: LotteryId;
  poolNumbers: number[];
  ticketSize: number;
  targetSize: number;
  maxTickets: number;
  pricePerTicketCents: number;
  budgetCents?: number;
  constraints?: GenerationConstraints;
  referenceContest?: Contest;
}

export interface CoveringDesignReport {
  algorithm: typeof COVERING_DESIGN_VERSION;
  poolNumbers: number[];
  ticketSize: number;
  targetSize: number;
  targetSubsets: number;
  coveredSubsets: number;
  coverageRatio: number;
  isCompleteCoverage: boolean;
  selectedTickets: number;
  maxTickets: number;
  costCents: number;
  budgetCents?: number;
}

export interface CoveringDesignResult {
  games: GeneratedGame[];
  report: CoveringDesignReport;
}

function combinationCount(n: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) return 0;
  const size = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= size; index += 1) {
    result = (result * (n - size + index)) / index;
  }
  return Math.round(result);
}

function combinations(values: number[], size: number): number[][] {
  const result: number[][] = [];
  const current: number[] = [];
  const walk = (start: number): void => {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    const needed = size - current.length;
    for (let index = start; index <= values.length - needed; index += 1) {
      current.push(values[index]!);
      walk(index + 1);
      current.pop();
    }
  };
  walk(0);
  return result;
}

function subsetKey(values: number[]): string {
  return values.join("-");
}

function validateOptions(options: CoveringDesignOptions): number[] {
  const config = getLotteryConfig(options.lottery);
  const pool = [...options.poolNumbers].sort((a, b) => a - b);
  if (pool.length !== new Set(pool).size) throw new Error("Coverage pool numbers must be unique");
  if (pool.some((value) => !Number.isInteger(value) || value < config.minNumber || value > config.maxNumber)) {
    throw new Error("Coverage pool contains a number outside the lottery universe");
  }
  if (!Number.isInteger(options.ticketSize) || options.ticketSize < config.drawSize || options.ticketSize > pool.length) {
    throw new Error("Coverage ticket size must fit between draw size and pool size");
  }
  if (!Number.isInteger(options.targetSize) || options.targetSize < 1 || options.targetSize > options.ticketSize) {
    throw new Error("Coverage target size must fit between 1 and ticket size");
  }
  if (!Number.isInteger(options.maxTickets) || options.maxTickets < 1) {
    throw new Error("Coverage maxTickets must be a positive integer");
  }
  if (!Number.isInteger(options.pricePerTicketCents) || options.pricePerTicketCents < 0) {
    throw new Error("Coverage pricePerTicketCents must be a non-negative integer");
  }
  if (options.budgetCents !== undefined && (!Number.isInteger(options.budgetCents) || options.budgetCents < 0)) {
    throw new Error("Coverage budgetCents must be a non-negative integer");
  }
  const candidateCount = combinationCount(pool.length, options.ticketSize);
  const targetCount = combinationCount(pool.length, options.targetSize);
  const targetSubsetsPerCandidate = combinationCount(options.ticketSize, options.targetSize);
  if (candidateCount > MAX_COVERAGE_CANDIDATES) {
    throw new Error(`Coverage candidate space exceeds safe limit (${candidateCount} > ${MAX_COVERAGE_CANDIDATES})`);
  }
  if (targetCount > MAX_COVERAGE_TARGETS) {
    throw new Error(`Coverage target space exceeds safe limit (${targetCount} > ${MAX_COVERAGE_TARGETS})`);
  }
  const incidenceCount = candidateCount * targetSubsetsPerCandidate;
  if (incidenceCount > MAX_COVERAGE_INCIDENCES) {
    throw new Error(`Coverage incidence space exceeds safe limit (${incidenceCount} > ${MAX_COVERAGE_INCIDENCES})`);
  }
  return pool;
}

function buildGame(
  lottery: LotteryId,
  numbers: number[],
  referenceContest?: Contest,
): GeneratedGame {
  return {
    lottery,
    numbers: [...numbers],
    fixedNumbers: [],
    variableNumbers: [...numbers],
    metadata: buildMetadata(numbers, referenceContest, lottery === "lotofacil"),
  };
}

export function generateCoveringDesign(options: CoveringDesignOptions): CoveringDesignResult {
  const pool = validateOptions(options);
  const allTargets = combinations(pool, options.targetSize);
  const uncovered = new Set(allTargets.map(subsetKey));
  const candidateNumbers = combinations(pool, options.ticketSize);
  const candidates = candidateNumbers
    .map((numbers) => ({
      numbers,
      targetKeys: combinations(numbers, options.targetSize).map(subsetKey),
      game: buildGame(options.lottery, numbers, options.referenceContest),
    }))
    .filter((candidate) => matchesGenerationConstraints(candidate.game, options.constraints));

  if (candidates.length === 0) {
    throw new Error("Coverage constraints leave no valid candidate tickets");
  }

  const budgetTicketLimit = options.budgetCents === undefined
    ? options.maxTickets
    : options.pricePerTicketCents === 0
      ? options.maxTickets
      : Math.floor(options.budgetCents / options.pricePerTicketCents);
  const ticketLimit = Math.min(options.maxTickets, budgetTicketLimit);
  if (ticketLimit < 1) {
    return {
      games: [],
      report: {
        algorithm: COVERING_DESIGN_VERSION,
        poolNumbers: pool,
        ticketSize: options.ticketSize,
        targetSize: options.targetSize,
        targetSubsets: allTargets.length,
        coveredSubsets: 0,
        coverageRatio: 0,
        isCompleteCoverage: false,
        selectedTickets: 0,
        maxTickets: options.maxTickets,
        costCents: 0,
        ...(options.budgetCents !== undefined ? { budgetCents: options.budgetCents } : {}),
      },
    };
  }

  const selected: GeneratedGame[] = [];
  const used = new Set<number>();
  while (selected.length < ticketLimit && uncovered.size > 0) {
    let bestIndex = -1;
    let bestGain = 0;
    for (let index = 0; index < candidates.length; index += 1) {
      if (used.has(index)) continue;
      let gain = 0;
      for (const key of candidates[index]!.targetKeys) {
        if (uncovered.has(key)) gain += 1;
      }
      if (gain > bestGain) {
        bestGain = gain;
        bestIndex = index;
      }
    }
    if (bestIndex < 0 || bestGain === 0) break;
    used.add(bestIndex);
    const selectedCandidate = candidates[bestIndex]!;
    selected.push(selectedCandidate.game);
    for (const key of selectedCandidate.targetKeys) uncovered.delete(key);
  }

  const coveredSubsets = allTargets.length - uncovered.size;
  const coverageRatio = allTargets.length === 0 ? 0 : coveredSubsets / allTargets.length;
  return {
    games: selected,
    report: {
      algorithm: COVERING_DESIGN_VERSION,
      poolNumbers: pool,
      ticketSize: options.ticketSize,
      targetSize: options.targetSize,
      targetSubsets: allTargets.length,
      coveredSubsets,
      coverageRatio,
      isCompleteCoverage: uncovered.size === 0,
      selectedTickets: selected.length,
      maxTickets: options.maxTickets,
      costCents: selected.length * options.pricePerTicketCents,
      ...(options.budgetCents !== undefined ? { budgetCents: options.budgetCents } : {}),
    },
  };
}
