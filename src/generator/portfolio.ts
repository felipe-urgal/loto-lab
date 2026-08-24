import type { GenerationMode, RankedCandidate } from "./shared.js";
import { selectWeightedItem } from "./shared.js";

export interface PortfolioCandidate extends RankedCandidate {
  numbers: number[];
  variableNumbers: number[];
}

export interface PortfolioSelectionOptions {
  overlapPenalty: number;
  beamWidth?: number;
  diversifiedPoolSize?: number;
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
