import type { GenerationMode, RankedCandidate } from "./shared.js";
import { selectWeightedItem, topRankedCandidates } from "./shared.js";

export interface PortfolioCandidate extends RankedCandidate {
  numbers: number[];
  variableNumbers: number[];
}

export interface PortfolioSelectionOptions {
  overlapPenalty: number;
  beamWidth?: number;
  diversifiedPoolSize?: number;
}

export interface PortfolioShortlistOptions {
  explorationLimit?: number;
  diversityPenalty: number;
}

interface PortfolioState<T extends PortfolioCandidate> {
  selected: T[];
  score: number;
  key: string;
}

function overlap(left: number[], right: number[]): number {
  const rightSet = new Set(right);
  return left.reduce((total, value) => total + (rightSet.has(value) ? 1 : 0), 0);
}

function candidateKey(candidate: PortfolioCandidate): string {
  return [...candidate.numbers].sort((a, b) => a - b).join("-");
}

function localDiversityScore<T extends PortfolioCandidate>(
  variableUsage: Map<number, number>,
  candidate: T,
  diversityPenalty: number,
): number {
  const reusedVariables = candidate.variableNumbers.reduce(
    (total, value) => total + (variableUsage.get(value) ?? 0),
    0,
  );
  return candidate.rank - reusedVariables * diversityPenalty;
}

/**
 * Builds a compact frontier for the global portfolio optimizer.
 *
 * Keeping only the highest local scores can accidentally remove every
 * disjoint alternative before the global optimizer sees them. This helper
 * first explores a wider ranked set, then greedily keeps representatives
 * that trade a small local-score loss for variable-number diversity.
 *
 * The accumulated overlap is represented by a usage counter per variable.
 * This is exactly equivalent to summing pairwise overlaps against every
 * already-selected candidate, but avoids rescanning the selected frontier
 * for every candidate at every shortlist step.
 */
export function buildPortfolioShortlist<T extends PortfolioCandidate>(
  candidates: Iterable<T>,
  limit: number,
  options: PortfolioShortlistOptions,
): T[] {
  const shortlistLimit = Math.max(1, Math.round(limit));
  if (!Number.isFinite(options.diversityPenalty) || options.diversityPenalty < 0) {
    throw new Error("Portfolio shortlist diversity penalty must be a non-negative number");
  }
  const explorationLimit = Math.max(
    shortlistLimit,
    Math.round(options.explorationLimit ?? Math.max(256, shortlistLimit * 16)),
  );
  const explored = topRankedCandidates(
    candidates,
    explorationLimit,
    (a, b) => b.rank - a.rank || candidateKey(a).localeCompare(candidateKey(b)),
  );
  if (explored.length <= shortlistLimit) return explored;

  const selected: T[] = [];
  const remaining = [...explored];
  const variableUsage = new Map<number, number>();
  while (selected.length < shortlistLimit && remaining.length > 0) {
    let winnerIndex = 0;
    let winnerScore = Number.NEGATIVE_INFINITY;
    let winnerKey = "";
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]!;
      const score = localDiversityScore(variableUsage, candidate, options.diversityPenalty);
      const key = candidateKey(candidate);
      if (score > winnerScore || (score === winnerScore && key.localeCompare(winnerKey) < 0)) {
        winnerScore = score;
        winnerIndex = index;
        winnerKey = key;
      }
    }
    const winner = remaining.splice(winnerIndex, 1)[0]!;
    selected.push(winner);
    for (const value of winner.variableNumbers) {
      variableUsage.set(value, (variableUsage.get(value) ?? 0) + 1);
    }
  }
  return selected;
}

function incrementalPortfolioScore<T extends PortfolioCandidate>(
  selected: T[],
  candidate: T,
  overlapPenalty: number,
): number {
  const diversityPenalty = selected.reduce(
    (total, existing) => total + overlap(existing.variableNumbers, candidate.variableNumbers) * overlapPenalty,
    0,
  );
  return candidate.rank - diversityPenalty;
}

export function selectPortfolioCandidates<T extends PortfolioCandidate>(
  candidateGroups: T[][],
  mode: GenerationMode,
  random: (() => number) | undefined,
  options: PortfolioSelectionOptions,
): T[] {
  if (candidateGroups.length === 0) return [];
  if (candidateGroups.some((group) => group.length === 0)) return [];
  if (!Number.isFinite(options.overlapPenalty) || options.overlapPenalty < 0) {
    throw new Error("Portfolio overlap penalty must be a non-negative number");
  }

  const beamWidth = Math.max(8, Math.min(256, Math.round(options.beamWidth ?? 96)));
  let beam: Array<PortfolioState<T>> = [{ selected: [], score: 0, key: "" }];

  for (const group of candidateGroups) {
    const expanded: Array<PortfolioState<T>> = [];
    for (const state of beam) {
      const usedGames = new Set(state.selected.map(candidateKey));
      for (const candidate of group) {
        const key = candidateKey(candidate);
        if (usedGames.has(key)) continue;
        const score = state.score + incrementalPortfolioScore(state.selected, candidate, options.overlapPenalty);
        expanded.push({
          selected: [...state.selected, candidate],
          score,
          key: `${state.key}|${key}`,
        });
      }
    }

    expanded.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
    beam = expanded.slice(0, beamWidth);
    if (beam.length === 0) return [];
  }

  if (mode === "deterministic") return beam[0]!.selected;
  if (!random) throw new Error("Diversified portfolio generation requires a seeded random source");

  const ranked = beam.map((state) => ({ ...state, rank: state.score }));
  const winner = selectWeightedItem(
    ranked,
    random,
    Math.max(2, Math.min(options.diversifiedPoolSize ?? 8, ranked.length)),
  );
  return winner?.selected ?? beam[0]!.selected;
}
