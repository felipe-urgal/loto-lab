import type {
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

export function buildNumberAnalysis(
  contests: Contest[],
  config: LotteryConfig,
  weights: AnalysisWeights = DEFAULT_WEIGHTS,
): NumberAnalysis[] {
  const scoped = contests
    .filter((contest) => contest.lottery === config.id)
    .sort((a, b) => a.number - b.number);

  if (scoped.length === 0) {
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

  const referenceDate = scoped.at(-1)!.date;
  const yearPrefix = referenceDate.slice(0, 4);
  const monthPrefix = referenceDate.slice(0, 7);

  const windows = {
    historical: scoped,
    year: scoped.filter((contest) => contest.date.startsWith(yearPrefix)),
    month: scoped.filter((contest) => contest.date.startsWith(monthPrefix)),
    recent10: scoped.slice(-10),
    recent20: scoped.slice(-20),
  };

  const numbers = numberRange(config);
  const normalized = {
    historical: normalize(ratesByNumber(windows.historical, config), numbers),
    year: normalize(ratesByNumber(windows.year, config), numbers),
    month: normalize(ratesByNumber(windows.month, config), numbers),
    recent10: normalize(ratesByNumber(windows.recent10, config), numbers),
    recent20: normalize(ratesByNumber(windows.recent20, config), numbers),
  };

  const rows = numbers.map((number) => {
    const historical = normalized.historical.get(number) ?? 0;
    const year = normalized.year.get(number) ?? 0;
    const month = normalized.month.get(number) ?? 0;
    const recent10 = normalized.recent10.get(number) ?? 0;
    const recent20 = normalized.recent20.get(number) ?? 0;
    const score =
      historical * weights.historical +
      year * weights.year +
      month * weights.month +
      recent10 * weights.recent10 +
      recent20 * weights.recent20;

    return { number, historical, year, month, recent10, recent20, score };
  });

  return classifyByRank(rows).sort((a, b) => a.number - b.number);
}
