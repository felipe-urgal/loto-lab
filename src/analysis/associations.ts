import type { Contest, LotteryConfig } from "../domain/types.js";
import { numberRange } from "./frequency.js";
import {
  combination,
  evidenceLevel,
  exactBinomialLookup,
  round,
} from "./statistics.js";
import type { EvidenceLevel } from "./statistics.js";

export interface AssociationStat {
  observed: number;
  expected: number;
  lift: number;
  zScore: number;
  pValue: number;
  adjustedPValue: number;
  evidence: EvidenceLevel;
}

export interface PairStat extends AssociationStat {
  numbers: [number, number];
}

export interface TripleStat extends AssociationStat {
  numbers: [number, number, number];
}

export interface AssociationsAnalysis {
  pairs: PairStat[];
  highlights: {
    positivePairs: PairStat[];
    negativePairs: PairStat[];
    positiveTriples: TripleStat[];
  };
  methodology: {
    pairComparisons: number;
    tripleComparisons: number;
    test: "exact-binomial-two-sided";
    correction: "bonferroni";
    note: string;
  };
}

function pairKey(a: number, b: number): string {
  return `${a}:${b}`;
}

function tripleKey(a: number, b: number, c: number): string {
  return `${a}:${b}:${c}`;
}

function associationStat(
  observed: number,
  expected: number,
  probability: number,
  trials: number,
  comparisons: number,
  exactPValue: number,
): AssociationStat {
  const variance = trials * probability * (1 - probability);
  const zScore = variance > 0 ? (observed - expected) / Math.sqrt(variance) : 0;
  const adjustedPValue = Math.min(1, exactPValue * comparisons);
  return {
    observed,
    expected: round(expected),
    lift: expected > 0 ? round(observed / expected) : 0,
    zScore: round(zScore),
    pValue: round(exactPValue, 10),
    adjustedPValue: round(adjustedPValue, 10),
    evidence: evidenceLevel(adjustedPValue),
  };
}

export function buildAssociations(
  contests: Contest[],
  config: LotteryConfig,
): AssociationsAnalysis {
  const universe = numberRange(config);
  const pairCounts = new Map<string, number>();
  const tripleCounts = new Map<string, number>();

  for (const contest of contests) {
    const numbers = [...contest.numbers].sort((a, b) => a - b);
    for (let first = 0; first < numbers.length - 1; first += 1) {
      for (let second = first + 1; second < numbers.length; second += 1) {
        const key = pairKey(numbers[first]!, numbers[second]!);
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        for (let third = second + 1; third < numbers.length; third += 1) {
          const triple = tripleKey(numbers[first]!, numbers[second]!, numbers[third]!);
          tripleCounts.set(triple, (tripleCounts.get(triple) ?? 0) + 1);
        }
      }
    }
  }

  const population = universe.length;
  const draw = config.drawSize;
  const pairProbability = population < 2
    ? 0
    : (draw * (draw - 1)) / (population * (population - 1));
  const pairExpected = contests.length * pairProbability;
  const totalPairs = combination(population, 2);
  const pairPValue = exactBinomialLookup(contests.length, pairProbability);
  const pairs: PairStat[] = [];
  for (let first = 0; first < universe.length - 1; first += 1) {
    for (let second = first + 1; second < universe.length; second += 1) {
      const a = universe[first]!;
      const b = universe[second]!;
      const observed = pairCounts.get(pairKey(a, b)) ?? 0;
      pairs.push({
        numbers: [a, b],
        ...associationStat(
          observed,
          pairExpected,
          pairProbability,
          contests.length,
          totalPairs,
          pairPValue(observed),
        ),
      });
    }
  }

  const tripleProbability = population < 3
    ? 0
    : (draw * (draw - 1) * (draw - 2)) /
      (population * (population - 1) * (population - 2));
  const tripleExpected = contests.length * tripleProbability;
  const totalTriples = combination(population, 3);
  const triplePValue = exactBinomialLookup(contests.length, tripleProbability);
  const triples: TripleStat[] = [...tripleCounts.entries()].map(([key, observed]) => {
    const [a, b, c] = key.split(":").map(Number) as [number, number, number];
    return {
      numbers: [a, b, c],
      ...associationStat(
        observed,
        tripleExpected,
        tripleProbability,
        contests.length,
        totalTriples,
        triplePValue(observed),
      ),
    };
  });

  return {
    pairs,
    highlights: {
      positivePairs: [...pairs].sort((a, b) => b.zScore - a.zScore).slice(0, 12),
      negativePairs: [...pairs].sort((a, b) => a.zScore - b.zScore).slice(0, 12),
      positiveTriples: [...triples].sort((a, b) => b.zScore - a.zScore).slice(0, 12),
    },
    methodology: {
      pairComparisons: totalPairs,
      tripleComparisons: totalTriples,
      test: "exact-binomial-two-sided",
      correction: "bonferroni",
      note: "Associações são exploratórias. O p-value é binomial bilateral exato e a correção por múltiplas comparações reduz falsos sinais produzidos pelo grande número de pares e trincas examinados.",
    },
  };
}
