import type {
  AnalysisModel,
  AnalysisWeights,
  Contest,
  LotteryConfig,
  NumberAnalysis,
  NumberTier,
} from "../domain/types.js";
import { calculateFrequency, numberRange } from "./frequency.js";

export const DEFAULT_WEIGHTS: AnalysisWeights = {
  year: 0.3,
  recent20: 0.25,
  month: 0.2,
  historical: 0.15,
  recent10: 0.1,
};

const SCORE_V2_SCALE = 12.5;
const POSITIVE_WINDOW_THRESHOLD = 60;
const NEGATIVE_WINDOW_THRESHOLD = 40;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalize(values: Map<number, number>, numbers: number[]): Map<number, number> {
  const all = numbers.map((number) => values.get(number) ?? 0);
  const min = Math.min(...all);
  const max = Math.max(...all);

  if (max === min) {
    return new Map(numbers.map((number) => [number, 50]));
  }

  return new Map(
    numbers.map((number) => [
      number,
      (((values.get(number) ?? 0) - min) / (max - min)) * 100,
    ]),
  );
}

function ratesByNumber(contests: Contest[], config: LotteryConfig): Map<number, number> {
  return new Map(calculateFrequency(contests, config).map((item) => [item.number, item.rate]));
}

function expectedAdjustedScores(
  contests: Contest[],
  config: LotteryConfig,
  numbers: number[],
): Map<number, number> {
  if (contests.length === 0) {
    return new Map(numbers.map((number) => [number, 50]));
  }

  const universeSize = config.maxNumber - config.minNumber + 1;
  const expectedRate = config.drawSize / universeSize;
  const standardError = Math.sqrt(
    (expectedRate * (1 - expectedRate)) / contests.length,
  );
  const rates = ratesByNumber(contests, config);

  if (!Number.isFinite(standardError) || standardError <= 0) {
    return new Map(numbers.map((number) => [number, 50]));
  }

  return new Map(numbers.map((number) => {
    const rate = rates.get(number) ?? 0;
    const zScore = (rate - expectedRate) / standardError;
    return [number, clamp(50 + zScore * SCORE_V2_SCALE, 0, 100)];
  }));
}

function classifyByRank(rows: Omit<NumberAnalysis, "tier">[]): NumberAnalysis[] {
  const ranked = [...rows].sort((a, b) => b.score - a.score || a.number - b.number);
  const third = Math.ceil(ranked.length / 3);
  const strong = new Set(ranked.slice(0, third).map((row) => row.number));
  const cold = new Set(ranked.slice(-third).map((row) => row.number));

  return rows.map((row) => {
    let tier: NumberTier = "balanced";
    if (strong.has(row.number)) tier = "strong";
    else if (cold.has(row.number)) tier = "cold";
    return { ...row, tier };
  });
}

function classifyByEvidence(rows: Omit<NumberAnalysis, "tier">[]): NumberAnalysis[] {
  return rows.map((row) => {
    const windows = [row.historical, row.year, row.month, row.recent10, row.recent20];
    const positiveWindows = windows.filter((value) => value >= POSITIVE_WINDOW_THRESHOLD).length;
    const negativeWindows = windows.filter((value) => value <= NEGATIVE_WINDOW_THRESHOLD).length;

    let tier: NumberTier = "balanced";
    if (positiveWindows >= 2 && row.score >= 55) tier = "strong";
    else if (negativeWindows >= 2 && row.score <= 45) tier = "cold";

    return { ...row, tier };
  });
}

function scopedWindows(contests: Contest[], config: LotteryConfig) {
  const scoped = contests
    .filter((contest) => contest.lottery === config.id)
    .sort((a, b) => a.number - b.number);

  if (scoped.length === 0) {
    return {
      scoped,
      historical: scoped,
      year: scoped,
      month: scoped,
      recent10: scoped,
      recent20: scoped,
    };
  }

  const referenceDate = scoped.at(-1)!.date;
  const yearPrefix = referenceDate.slice(0, 4);
  const monthPrefix = referenceDate.slice(0, 7);

  return {
    scoped,
    historical: scoped,
    year: scoped.filter((contest) => contest.date.startsWith(yearPrefix)),
    month: scoped.filter((contest) => contest.date.startsWith(monthPrefix)),
    recent10: scoped.slice(-10),
    recent20: scoped.slice(-20),
  };
}

function weightedRows(
  numbers: number[],
  windows: {
    historical: Map<number, number>;
    year: Map<number, number>;
    month: Map<number, number>;
    recent10: Map<number, number>;
    recent20: Map<number, number>;
  },
  weights: AnalysisWeights,
): Omit<NumberAnalysis, "tier">[] {
  return numbers.map((number) => {
    const historical = windows.historical.get(number) ?? 50;
    const year = windows.year.get(number) ?? 50;
    const month = windows.month.get(number) ?? 50;
    const recent10 = windows.recent10.get(number) ?? 50;
    const recent20 = windows.recent20.get(number) ?? 50;
    const score =
      historical * weights.historical +
      year * weights.year +
      month * weights.month +
      recent10 * weights.recent10 +
      recent20 * weights.recent20;

    return { number, historical, year, month, recent10, recent20, score };
  });
}

function buildScoreV1(
  contests: Contest[],
  config: LotteryConfig,
  weights: AnalysisWeights,
): NumberAnalysis[] {
  const windows = scopedWindows(contests, config);
  const numbers = numberRange(config);

  if (windows.scoped.length === 0) {
    return numbers.map((number) => ({
      number,
      historical: 50,
      year: 50,
      month: 50,
      recent10: 50,
      recent20: 50,
      score: 50,
      tier: "balanced" as const,
    }));
  }

  const normalized = {
    historical: normalize(ratesByNumber(windows.historical, config), numbers),
    year: normalize(ratesByNumber(windows.year, config), numbers),
    month: normalize(ratesByNumber(windows.month, config), numbers),
    recent10: normalize(ratesByNumber(windows.recent10, config), numbers),
    recent20: normalize(ratesByNumber(windows.recent20, config), numbers),
  };

  return classifyByRank(weightedRows(numbers, normalized, weights))
    .sort((a, b) => a.number - b.number);
}

function buildScoreV2(
  contests: Contest[],
  config: LotteryConfig,
  weights: AnalysisWeights,
): NumberAnalysis[] {
  const windows = scopedWindows(contests, config);
  const numbers = numberRange(config);
  const adjusted = {
    historical: expectedAdjustedScores(windows.historical, config, numbers),
    year: expectedAdjustedScores(windows.year, config, numbers),
    month: expectedAdjustedScores(windows.month, config, numbers),
    recent10: expectedAdjustedScores(windows.recent10, config, numbers),
    recent20: expectedAdjustedScores(windows.recent20, config, numbers),
  };

  return classifyByEvidence(weightedRows(numbers, adjusted, weights))
    .sort((a, b) => a.number - b.number);
}

function buildNoScore(config: LotteryConfig): NumberAnalysis[] {
  return numberRange(config).map((number) => ({
    number,
    historical: 50,
    year: 50,
    month: 50,
    recent10: 50,
    recent20: 50,
    score: 50,
    tier: "balanced" as const,
  }));
}

export function buildNumberAnalysis(
  contests: Contest[],
  config: LotteryConfig,
  weights: AnalysisWeights = DEFAULT_WEIGHTS,
  model: AnalysisModel = "score-v2",
): NumberAnalysis[] {
  if (model === "no-score") return buildNoScore(config);
  if (model === "score-v1") return buildScoreV1(contests, config, weights);
  return buildScoreV2(contests, config, weights);
}
