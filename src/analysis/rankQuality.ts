import type { AnalysisModel, AnalysisWeights, Contest, LotteryConfig } from "../domain/types.js";
import { eligibleTargetIndexes } from "./contestEligibility.js";
import { buildNumberAnalysis } from "./scoring.js";

export interface RankingQualityRound {
  contest: number;
  auc: number;
  meanDrawnPercentile: number;
}

export interface RankingQualityResult {
  model: AnalysisModel;
  rounds: number;
  auc: number;
  deltaFromRandom: number;
  meanDrawnPercentile: number;
  series: RankingQualityRound[];
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundAuc(scores: Map<number, number>, drawn: Set<number>, universe: number[]): number {
  const positives = universe.filter((number) => drawn.has(number));
  const negatives = universe.filter((number) => !drawn.has(number));
  if (positives.length === 0 || negatives.length === 0) return 0.5;

  let wins = 0;
  let comparisons = 0;
  for (const positive of positives) {
    const positiveScore = scores.get(positive) ?? 50;
    for (const negative of negatives) {
      const negativeScore = scores.get(negative) ?? 50;
      comparisons += 1;
      if (positiveScore > negativeScore) wins += 1;
      else if (positiveScore === negativeScore) wins += 0.5;
    }
  }
  return comparisons === 0 ? 0.5 : wins / comparisons;
}

function meanDrawnPercentile(scores: Map<number, number>, drawn: Set<number>, universe: number[]): number {
  if (drawn.size === 0 || universe.length <= 1) return 0.5;
  let total = 0;
  for (const number of drawn) {
    const score = scores.get(number) ?? 50;
    let below = 0;
    let tied = 0;
    for (const candidate of universe) {
      if (candidate === number) continue;
      const candidateScore = scores.get(candidate) ?? 50;
      if (candidateScore < score) below += 1;
      else if (candidateScore === score) tied += 1;
    }
    total += (below + tied * 0.5) / (universe.length - 1);
  }
  return total / drawn.size;
}

export function evaluateRankingQuality(
  contests: Contest[],
  config: LotteryConfig,
  options: {
    model?: AnalysisModel;
    weights?: AnalysisWeights;
    warmupContests?: number;
    startContest?: number;
    endContest?: number;
    maxRounds?: number;
  } = {},
): RankingQualityResult {
  const model = options.model ?? "score-v2";
  const warmupContests = options.warmupContests ?? 20;
  const maxRounds = options.maxRounds ?? 500;
  const scoped = contests
    .filter((contest) => contest.lottery === config.id)
    .sort((a, b) => a.number - b.number);
  const universe = Array.from(
    { length: config.maxNumber - config.minNumber + 1 },
    (_, index) => config.minNumber + index,
  );
  const targetIndexes = eligibleTargetIndexes(scoped, {
    warmupContests,
    ...(options.startContest !== undefined ? { startContest: options.startContest } : {}),
    ...(options.endContest !== undefined ? { endContest: options.endContest } : {}),
    ...(maxRounds > 0 ? { maxRounds } : {}),
  });
  const series: RankingQualityRound[] = [];

  for (const index of targetIndexes) {
    const target = scoped[index]!;
    const history = scoped.slice(0, index);
    const analysis = buildNumberAnalysis(history, config, options.weights, model);
    const scores = new Map(analysis.map((row) => [row.number, row.score]));
    const drawn = new Set(target.numbers);
    series.push({
      contest: target.number,
      auc: round(roundAuc(scores, drawn, universe)),
      meanDrawnPercentile: round(meanDrawnPercentile(scores, drawn, universe)),
    });
  }

  const auc = series.length === 0
    ? 0.5
    : series.reduce((sum, roundItem) => sum + roundItem.auc, 0) / series.length;
  const percentile = series.length === 0
    ? 0.5
    : series.reduce((sum, roundItem) => sum + roundItem.meanDrawnPercentile, 0) / series.length;

  return {
    model,
    rounds: series.length,
    auc: round(auc),
    deltaFromRandom: round(auc - 0.5),
    meanDrawnPercentile: round(percentile),
    series,
  };
}
