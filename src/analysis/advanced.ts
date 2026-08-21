import type {
  AnalysisWeights,
  Contest,
  LotteryConfig,
  NumberAnalysis,
  NumberTier,
} from "../domain/types.js";
import { calculateFrequency, numberRange } from "./frequency.js";
import { buildNumberAnalysis, DEFAULT_WEIGHTS } from "./scoring.js";

export type EvidenceLevel = "none" | "weak" | "moderate";

interface DistributionSummary {
  mean: number;
  min: number;
  max: number;
  p10: number;
  p50: number;
  p90: number;
}

interface ProbabilityPoint {
  value: number;
  probability: number;
}

interface StructuralMetric {
  current: number | null;
  observed: DistributionSummary | null;
  expectedMean?: number;
  expectedStdDev?: number;
  percentile?: number;
  deviationFromExpected?: number;
  theoreticalDistribution?: ProbabilityPoint[];
}

interface ContestStructure {
  odd: number;
  even: number;
  sum: number;
  repeated: number;
  low: number;
  high: number;
  longestRun: number;
  lines?: number[];
  columns?: number[];
  frame?: number;
}

interface PairStat {
  numbers: [number, number];
  observed: number;
  expected: number;
  lift: number;
  zScore: number;
  pValue: number;
  adjustedPValue: number;
  evidence: EvidenceLevel;
}

interface TripleStat {
  numbers: [number, number, number];
  observed: number;
  expected: number;
  lift: number;
  zScore: number;
  adjustedPValue: number;
  evidence: EvidenceLevel;
}

const ANALYSIS_WINDOWS = [100, 300, 500] as const;
const MIN_VALIDATION_HISTORY = 20;
const WEIGHT_MULTIPLIERS = [0.9, 1, 1.1] as const;

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  const weight = position - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function summarize(values: number[]): DistributionSummary | null {
  if (values.length === 0) return null;
  return {
    mean: round(mean(values)),
    min: Math.min(...values),
    max: Math.max(...values),
    p10: round(quantile(values, 0.1)),
    p50: round(quantile(values, 0.5)),
    p90: round(quantile(values, 0.9)),
  };
}

function percentileRank(value: number, values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const belowOrEqual = values.filter((candidate) => candidate <= value).length;
  return round(belowOrEqual / values.length);
}

export function combination(n: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) return 0;
  const selected = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= selected; index += 1) {
    result = (result * (n - selected + index)) / index;
  }
  return result;
}

export function hypergeometricDistribution(
  population: number,
  successStates: number,
  draws: number,
): ProbabilityPoint[] {
  const denominator = combination(population, draws);
  if (denominator === 0) return [];
  const minValue = Math.max(0, draws - (population - successStates));
  const maxValue = Math.min(draws, successStates);
  const points: ProbabilityPoint[] = [];
  for (let value = minValue; value <= maxValue; value += 1) {
    points.push({
      value,
      probability: round(
        (combination(successStates, value) * combination(population - successStates, draws - value)) /
          denominator,
        8,
      ),
    });
  }
  return points;
}

function expectedFromDistribution(points: ProbabilityPoint[]): number {
  return points.reduce((sum, point) => sum + point.value * point.probability, 0);
}

function varianceFromDistribution(points: ProbabilityPoint[], expected: number): number {
  return points.reduce(
    (sum, point) => sum + ((point.value - expected) ** 2) * point.probability,
    0,
  );
}

function normalCdf(value: number): number {
  const abs = Math.abs(value);
  const t = 1 / (1 + 0.2316419 * abs);
  const density = 0.3989422804014327 * Math.exp(-(abs * abs) / 2);
  const polynomial =
    t * (0.319381530 +
      t * (-0.356563782 +
        t * (1.781477937 +
          t * (-1.821255978 + t * 1.330274429))));
  const cdf = 1 - density * polynomial;
  return value >= 0 ? cdf : 1 - cdf;
}

function twoSidedNormalP(zScore: number): number {
  if (!Number.isFinite(zScore)) return 1;
  return Math.max(0, Math.min(1, 2 * (1 - normalCdf(Math.abs(zScore)))));
}

function evidenceLevel(adjustedPValue: number): EvidenceLevel {
  if (adjustedPValue < 0.01) return "moderate";
  if (adjustedPValue < 0.05) return "weak";
  return "none";
}

function sortedNumbers(contest: Contest): number[] {
  return [...contest.numbers].sort((a, b) => a - b);
}

function longestConsecutiveRun(numbers: number[]): number {
  const sorted = [...numbers].sort((a, b) => a - b);
  let best = sorted.length > 0 ? 1 : 0;
  let current = best;
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] === sorted[index - 1]! + 1) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }
  return best;
}

function lotofacilGrid(numbers: number[]) {
  const lines = Array.from({ length: 5 }, () => 0);
  const columns = Array.from({ length: 5 }, () => 0);
  let frame = 0;
  for (const number of numbers) {
    const zeroBased = number - 1;
    const row = Math.floor(zeroBased / 5);
    const column = zeroBased % 5;
    lines[row] = (lines[row] ?? 0) + 1;
    columns[column] = (columns[column] ?? 0) + 1;
    if (row === 0 || row === 4 || column === 0 || column === 4) frame += 1;
  }
  return { lines, columns, frame };
}

function structureForContest(
  contest: Contest,
  previous: Contest | undefined,
  config: LotteryConfig,
): ContestStructure {
  const numbers = sortedNumbers(contest);
  const previousSet = new Set(previous?.numbers ?? []);
  const midpoint = Math.floor((config.minNumber + config.maxNumber) / 2);
  const odd = numbers.filter((number) => number % 2 !== 0).length;
  const repeated = previous
    ? numbers.filter((number) => previousSet.has(number)).length
    : 0;
  const low = numbers.filter((number) => number <= midpoint).length;
  const base: ContestStructure = {
    odd,
    even: numbers.length - odd,
    sum: numbers.reduce((total, number) => total + number, 0),
    repeated,
    low,
    high: numbers.length - low,
    longestRun: longestConsecutiveRun(numbers),
  };
  if (config.id === "lotofacil") return { ...base, ...lotofacilGrid(numbers) };
  return base;
}

function structuralMetric(
  current: number | null,
  observedValues: number[],
  theoreticalDistribution?: ProbabilityPoint[],
  expectedMeanOverride?: number,
  expectedStdDevOverride?: number,
): StructuralMetric {
  const expectedMean = expectedMeanOverride ??
    (theoreticalDistribution ? expectedFromDistribution(theoreticalDistribution) : undefined);
  const variance = theoreticalDistribution && expectedMean !== undefined
    ? varianceFromDistribution(theoreticalDistribution, expectedMean)
    : undefined;
  const expectedStdDev = expectedStdDevOverride ??
    (variance !== undefined ? Math.sqrt(Math.max(0, variance)) : undefined);
  const percentile = current === null ? undefined : percentileRank(current, observedValues);
  return {
    current,
    observed: summarize(observedValues),
    ...(expectedMean !== undefined ? { expectedMean: round(expectedMean) } : {}),
    ...(expectedStdDev !== undefined ? { expectedStdDev: round(expectedStdDev) } : {}),
    ...(percentile !== undefined ? { percentile } : {}),
    ...(current !== null && expectedMean !== undefined
      ? { deviationFromExpected: round(current - expectedMean) }
      : {}),
    ...(theoreticalDistribution ? { theoreticalDistribution } : {}),
  };
}

function methodologyRanges(config: LotteryConfig) {
  if (config.id === "mega-sena") {
    return {
      repeated: { min: 0, max: 2, preferredMin: 0, preferredMax: 2 },
      odd: { min: 2, max: 4 },
    };
  }
  if (config.id === "lotofacil") {
    return {
      repeated: { min: 7, max: 11, preferredMin: 8, preferredMax: 10 },
      odd: { min: 6, max: 9 },
    };
  }
  return {
    repeated: { min: 0, max: 3, preferredMin: 1, preferredMax: 2 },
    odd: { min: 3, max: 4 },
  };
}

function exactFilterCoverage(config: LotteryConfig, previousNumbers: number[]) {
  const ranges = methodologyRanges(config);
  const drawSize = config.drawSize;
  const previous = new Set(previousNumbers);
  const numbers = numberRange(config);
  const dp = Array.from({ length: drawSize + 1 }, () =>
    Array.from({ length: drawSize + 1 }, () => Array(drawSize + 1).fill(0) as number[]),
  );
  dp[0]![0]![0] = 1;

  let processed = 0;
  for (const number of numbers) {
    const repeated = previous.has(number) ? 1 : 0;
    const odd = number % 2 !== 0 ? 1 : 0;
    for (let selected = Math.min(processed, drawSize - 1); selected >= 0; selected -= 1) {
      for (let repeatedCount = 0; repeatedCount <= selected; repeatedCount += 1) {
        for (let oddCount = 0; oddCount <= selected; oddCount += 1) {
          const count = dp[selected]![repeatedCount]![oddCount]!;
          if (count === 0) continue;
          dp[selected + 1]![repeatedCount + repeated]![oddCount + odd] += count;
        }
      }
    }
    processed += 1;
  }

  let passing = 0;
  for (let repeated = ranges.repeated.min; repeated <= ranges.repeated.max; repeated += 1) {
    for (let odd = ranges.odd.min; odd <= ranges.odd.max; odd += 1) {
      passing += dp[drawSize]![repeated]?.[odd] ?? 0;
    }
  }
  const total = combination(numbers.length, drawSize);
  return { passing, total, coverage: total === 0 ? 0 : passing / total, ranges };
}

function buildStructure(contests: Contest[], config: LotteryConfig) {
  const structures = contests.map((contest, index) =>
    structureForContest(contest, index > 0 ? contests[index - 1] : undefined, config),
  );
  const latest = structures.at(-1);
  const repeatValues = structures.slice(1).map((item) => item.repeated);
  const oddValues = structures.map((item) => item.odd);
  const sumValues = structures.map((item) => item.sum);
  const lowValues = structures.map((item) => item.low);
  const longestRunValues = structures.map((item) => item.longestRun);
  const population = config.maxNumber - config.minNumber + 1;
  const oddPool = numberRange(config).filter((number) => number % 2 !== 0).length;
  const midpoint = Math.floor((config.minNumber + config.maxNumber) / 2);
  const lowPool = numberRange(config).filter((number) => number <= midpoint).length;
  const repeatedDistribution = hypergeometricDistribution(population, config.drawSize, config.drawSize);
  const oddDistribution = hypergeometricDistribution(population, oddPool, config.drawSize);
  const lowDistribution = hypergeometricDistribution(population, lowPool, config.drawSize);
  const populationVariance = ((population ** 2) - 1) / 12;
  const sumVariance = population <= 1
    ? 0
    : config.drawSize * populationVariance * ((population - config.drawSize) / (population - 1));
  const expectedSum = config.drawSize * ((config.minNumber + config.maxNumber) / 2);

  const exactCoverage = exactFilterCoverage(config, contests.at(-1)?.numbers ?? []);
  const ranges = exactCoverage.ranges;
  const historicalTransitions = structures.slice(1);
  const historicalPassing = historicalTransitions.filter((item) =>
    item.repeated >= ranges.repeated.min && item.repeated <= ranges.repeated.max &&
    item.odd >= ranges.odd.min && item.odd <= ranges.odd.max,
  ).length;

  const lineMeans = config.id === "lotofacil"
    ? Array.from({ length: 5 }, (_, index) => round(mean(structures.map((item) => item.lines?.[index] ?? 0))))
    : undefined;
  const columnMeans = config.id === "lotofacil"
    ? Array.from({ length: 5 }, (_, index) => round(mean(structures.map((item) => item.columns?.[index] ?? 0))))
    : undefined;
  const frameValues = config.id === "lotofacil"
    ? structures.map((item) => item.frame ?? 0)
    : [];
  const frameDistribution = config.id === "lotofacil"
    ? hypergeometricDistribution(25, 16, 15)
    : undefined;

  return {
    current: latest ?? null,
    metrics: {
      repeated: structuralMetric(latest?.repeated ?? null, repeatValues, repeatedDistribution),
      odd: structuralMetric(latest?.odd ?? null, oddValues, oddDistribution),
      sum: structuralMetric(
        latest?.sum ?? null,
        sumValues,
        undefined,
        expectedSum,
        Math.sqrt(Math.max(0, sumVariance)),
      ),
      low: structuralMetric(latest?.low ?? null, lowValues, lowDistribution),
      longestRun: structuralMetric(latest?.longestRun ?? null, longestRunValues),
      ...(config.id === "lotofacil"
        ? {
            frame: structuralMetric(
              latest?.frame ?? null,
              frameValues,
              frameDistribution,
            ),
          }
        : {}),
    },
    grid: config.id === "lotofacil"
      ? {
          currentLines: latest?.lines ?? [0, 0, 0, 0, 0],
          currentColumns: latest?.columns ?? [0, 0, 0, 0, 0],
          historicalLineMean: lineMeans,
          historicalColumnMean: columnMeans,
        }
      : null,
    methodologyFilter: {
      rules: {
        repeated: ranges.repeated,
        odd: ranges.odd,
      },
      exactUniverse: {
        passing: exactCoverage.passing,
        total: exactCoverage.total,
        coverage: round(exactCoverage.coverage),
      },
      historical: {
        passing: historicalPassing,
        total: historicalTransitions.length,
        coverage: historicalTransitions.length === 0
          ? 0
          : round(historicalPassing / historicalTransitions.length),
      },
      note: "Cobertura exata considera apenas repetição e paridade, as faixas estruturais explícitas da metodologia; soma e demais estruturas permanecem descritivas.",
    },
  };
}

function rankRows(rows: NumberAnalysis[]) {
  return [...rows].sort((a, b) => b.score - a.score || a.number - b.number);
}

function rankMap(rows: NumberAnalysis[]): Map<number, number> {
  return new Map(rankRows(rows).map((row, index) => [row.number, index + 1]));
}

function tierMap(rows: NumberAnalysis[]): Map<number, NumberTier> {
  return new Map(rows.map((row) => [row.number, row.tier]));
}

function rawFrequencyMap(contests: Contest[], config: LotteryConfig) {
  return new Map(calculateFrequency(contests, config).map((item) => [item.number, item]));
}

function currentDelay(contests: Contest[], number: number): number {
  let delay = 0;
  for (let index = contests.length - 1; index >= 0; index -= 1) {
    if (contests[index]!.numbers.includes(number)) return delay;
    delay += 1;
  }
  return contests.length;
}

function currentStreak(contests: Contest[], number: number): number {
  let streak = 0;
  for (let index = contests.length - 1; index >= 0; index -= 1) {
    if (!contests[index]!.numbers.includes(number)) break;
    streak += 1;
  }
  return streak;
}

function historicalDelays(contests: Contest[], number: number): number[] {
  const occurrenceIndexes = contests
    .map((contest, index) => contest.numbers.includes(number) ? index : -1)
    .filter((index) => index >= 0);
  const delays: number[] = [];
  for (let index = 1; index < occurrenceIndexes.length; index += 1) {
    delays.push(occurrenceIndexes[index]! - occurrenceIndexes[index - 1]! - 1);
  }
  return delays;
}

function weightScenarios(base: AnalysisWeights): AnalysisWeights[] {
  const keys = ["year", "recent20", "month", "historical", "recent10"] as const;
  const scenarios: AnalysisWeights[] = [];

  function visit(index: number, multipliers: number[]) {
    if (index === keys.length) {
      const raw = Object.fromEntries(keys.map((key, keyIndex) => [key, base[key] * multipliers[keyIndex]!])) as unknown as AnalysisWeights;
      const total = keys.reduce((sum, key) => sum + raw[key], 0);
      scenarios.push(Object.fromEntries(keys.map((key) => [key, raw[key] / total])) as unknown as AnalysisWeights);
      return;
    }
    for (const multiplier of WEIGHT_MULTIPLIERS) visit(index + 1, [...multipliers, multiplier]);
  }

  visit(0, []);
  return scenarios;
}

function scoreWithWeights(row: NumberAnalysis, weights: AnalysisWeights): number {
  return row.historical * weights.historical +
    row.year * weights.year +
    row.month * weights.month +
    row.recent10 * weights.recent10 +
    row.recent20 * weights.recent20;
}

function robustnessByNumber(rows: NumberAnalysis[], weights: AnalysisWeights) {
  const currentTiers = tierMap(rows);
  const scenarios = weightScenarios(weights);
  const numbers = rows.map((row) => row.number);
  const third = Math.ceil(numbers.length / 3);
  const stats = new Map(numbers.map((number) => [number, {
    sameTier: 0,
    strong: 0,
    minRank: Number.POSITIVE_INFINITY,
    maxRank: 0,
  }]));

  for (const scenario of scenarios) {
    const ranked = [...rows]
      .map((row) => ({ number: row.number, score: scoreWithWeights(row, scenario) }))
      .sort((a, b) => b.score - a.score || a.number - b.number);
    const strong = new Set(ranked.slice(0, third).map((row) => row.number));
    const cold = new Set(ranked.slice(-third).map((row) => row.number));
    for (let index = 0; index < ranked.length; index += 1) {
      const number = ranked[index]!.number;
      const rank = index + 1;
      const tier: NumberTier = strong.has(number) ? "strong" : cold.has(number) ? "cold" : "balanced";
      const stat = stats.get(number)!;
      if (tier === currentTiers.get(number)) stat.sameTier += 1;
      if (tier === "strong") stat.strong += 1;
      stat.minRank = Math.min(stat.minRank, rank);
      stat.maxRank = Math.max(stat.maxRank, rank);
    }
  }

  return new Map([...stats].map(([number, stat]) => [number, {
    scenarioCount: scenarios.length,
    tierStability: round(stat.sameTier / scenarios.length),
    strongShare: round(stat.strong / scenarios.length),
    rankRange: [stat.minRank, stat.maxRank] as [number, number],
  }]));
}

function buildDynamics(contests: Contest[], config: LotteryConfig, currentRows: NumberAnalysis[]) {
  const currentRanks = rankMap(currentRows);
  const historicalRanks = new Map<number, Map<number, number>>();
  for (const offset of [1, 5, 10, 20]) {
    const prefixLength = contests.length - offset;
    if (prefixLength >= 1) {
      historicalRanks.set(offset, rankMap(buildNumberAnalysis(contests.slice(0, prefixLength), config)));
    }
  }

  const recentTierSnapshots: Array<Map<number, NumberTier>> = [];
  const firstSnapshot = Math.max(1, contests.length - 9);
  for (let length = firstSnapshot; length <= contests.length; length += 1) {
    recentTierSnapshots.push(tierMap(buildNumberAnalysis(contests.slice(0, length), config)));
  }

  const robustness = robustnessByNumber(currentRows, DEFAULT_WEIGHTS);
  const latestDate = contests.at(-1)?.date;
  const yearPrefix = latestDate?.slice(0, 4) ?? "";
  const monthPrefix = latestDate?.slice(0, 7) ?? "";
  const frequencyWindows = {
    historical: rawFrequencyMap(contests, config),
    year: rawFrequencyMap(contests.filter((contest) => contest.date.startsWith(yearPrefix)), config),
    month: rawFrequencyMap(contests.filter((contest) => contest.date.startsWith(monthPrefix)), config),
    recent10: rawFrequencyMap(contests.slice(-10), config),
    recent20: rawFrequencyMap(contests.slice(-20), config),
  };

  const items = currentRows.map((row) => {
    const rank = currentRanks.get(row.number) ?? 0;
    const rank1 = historicalRanks.get(1)?.get(row.number);
    const rank5 = historicalRanks.get(5)?.get(row.number);
    const rank10 = historicalRanks.get(10)?.get(row.number);
    const rank20 = historicalRanks.get(20)?.get(row.number);
    const movement = (previous: number | undefined) => previous === undefined ? null : previous - rank;
    const movement10 = movement(rank10);
    const sameTierCount = recentTierSnapshots.filter((snapshot) => snapshot.get(row.number) === row.tier).length;
    const strongCount = recentTierSnapshots.filter((snapshot) => snapshot.get(row.number) === "strong").length;
    const delay = currentDelay(contests, row.number);
    const delays = historicalDelays(contests, row.number);
    const robustnessItem = robustness.get(row.number)!;
    const contribution = {
      year: round(row.year * DEFAULT_WEIGHTS.year),
      recent20: round(row.recent20 * DEFAULT_WEIGHTS.recent20),
      month: round(row.month * DEFAULT_WEIGHTS.month),
      historical: round(row.historical * DEFAULT_WEIGHTS.historical),
      recent10: round(row.recent10 * DEFAULT_WEIGHTS.recent10),
    };

    return {
      number: row.number,
      tier: row.tier,
      score: round(row.score),
      rank,
      previousRanks: { one: rank1 ?? null, five: rank5 ?? null, ten: rank10 ?? null, twenty: rank20 ?? null },
      movements: { one: movement(rank1), five: movement(rank5), ten: movement10, twenty: movement(rank20) },
      trend: movement10 === null ? "unknown" : movement10 >= 5 ? "rising" : movement10 <= -5 ? "falling" : "stable",
      recentTierStability: recentTierSnapshots.length === 0 ? 0 : round(sameTierCount / recentTierSnapshots.length),
      recentStrongShare: recentTierSnapshots.length === 0 ? 0 : round(strongCount / recentTierSnapshots.length),
      weightRobustness: robustnessItem,
      delay: {
        current: delay,
        percentile: percentileRank(delay, delays) ?? 0,
        historical: summarize(delays),
      },
      streak: currentStreak(contests, row.number),
      frequency: {
        historical: frequencyWindows.historical.get(row.number) ?? { count: 0, rate: 0 },
        year: frequencyWindows.year.get(row.number) ?? { count: 0, rate: 0 },
        month: frequencyWindows.month.get(row.number) ?? { count: 0, rate: 0 },
        recent10: frequencyWindows.recent10.get(row.number) ?? { count: 0, rate: 0 },
        recent20: frequencyWindows.recent20.get(row.number) ?? { count: 0, rate: 0 },
      },
      components: {
        historical: round(row.historical),
        year: round(row.year),
        month: round(row.month),
        recent10: round(row.recent10),
        recent20: round(row.recent20),
      },
      contribution,
    };
  });

  const movers = [...items]
    .filter((item) => item.movements.ten !== null)
    .sort((a, b) => (b.movements.ten ?? 0) - (a.movements.ten ?? 0));

  return {
    items,
    movers: {
      rising: movers.filter((item) => (item.movements.ten ?? 0) > 0).slice(0, 8).map((item) => ({ number: item.number, movement: item.movements.ten, rank: item.rank })),
      falling: [...movers].reverse().filter((item) => (item.movements.ten ?? 0) < 0).slice(0, 8).map((item) => ({ number: item.number, movement: item.movements.ten, rank: item.rank })),
    },
  };
}

function buildCycles(contests: Contest[], config: LotteryConfig) {
  const universe = numberRange(config);
  const seen = new Set<number>();
  const completedLengths: number[] = [];
  let currentLength = 0;
  for (const contest of contests) {
    currentLength += 1;
    for (const number of contest.numbers) seen.add(number);
    if (seen.size === universe.length) {
      completedLengths.push(currentLength);
      seen.clear();
      currentLength = 0;
    }
  }
  return {
    currentLength,
    seen: seen.size,
    missing: universe.filter((number) => !seen.has(number)),
    completedCount: completedLengths.length,
    historicalLength: summarize(completedLengths),
  };
}

function pairKey(a: number, b: number): string {
  return `${a}:${b}`;
}

function tripleKey(a: number, b: number, c: number): string {
  return `${a}:${b}:${c}`;
}

function associationStat(observed: number, expected: number, probability: number, trials: number, comparisons: number) {
  const variance = trials * probability * (1 - probability);
  const zScore = variance > 0 ? (observed - expected) / Math.sqrt(variance) : 0;
  const pValue = twoSidedNormalP(zScore);
  const adjustedPValue = Math.min(1, pValue * comparisons);
  return {
    observed,
    expected: round(expected),
    lift: expected > 0 ? round(observed / expected) : 0,
    zScore: round(zScore),
    pValue: round(pValue, 8),
    adjustedPValue: round(adjustedPValue, 8),
    evidence: evidenceLevel(adjustedPValue),
  };
}

function buildAssociations(contests: Contest[], config: LotteryConfig) {
  const universe = numberRange(config);
  const pairCounts = new Map<string, number>();
  const tripleCounts = new Map<string, number>();

  for (const contest of contests) {
    const numbers = sortedNumbers(contest);
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
  const pairProbability = population < 2 ? 0 : (draw * (draw - 1)) / (population * (population - 1));
  const pairExpected = contests.length * pairProbability;
  const totalPairs = combination(population, 2);
  const pairs: PairStat[] = [];
  for (let first = 0; first < universe.length - 1; first += 1) {
    for (let second = first + 1; second < universe.length; second += 1) {
      const a = universe[first]!;
      const b = universe[second]!;
      pairs.push({
        numbers: [a, b],
        ...associationStat(pairCounts.get(pairKey(a, b)) ?? 0, pairExpected, pairProbability, contests.length, totalPairs),
      });
    }
  }

  const tripleProbability = population < 3
    ? 0
    : (draw * (draw - 1) * (draw - 2)) / (population * (population - 1) * (population - 2));
  const tripleExpected = contests.length * tripleProbability;
  const totalTriples = combination(population, 3);
  const triples: TripleStat[] = [...tripleCounts.entries()].map(([key, observed]) => {
    const [a, b, c] = key.split(":").map(Number) as [number, number, number];
    const stat = associationStat(observed, tripleExpected, tripleProbability, contests.length, totalTriples);
    return {
      numbers: [a, b, c],
      observed: stat.observed,
      expected: stat.expected,
      lift: stat.lift,
      zScore: stat.zScore,
      adjustedPValue: stat.adjustedPValue,
      evidence: stat.evidence,
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
      correction: "bonferroni",
      note: "Associações são exploratórias. A correção por múltiplas comparações reduz falsos sinais produzidos apenas pelo grande número de pares e trincas examinados.",
    },
  };
}

function buildSimilarity(contests: Contest[], config: LotteryConfig) {
  const latest = contests.at(-1);
  if (!latest) return { overlapDistribution: [], closest: [] };
  const latestSet = new Set(latest.numbers);
  const latestStructure = structureForContest(latest, contests.at(-2), config);
  const overlapCounts = new Map<number, number>();
  const candidates = contests.slice(0, -1).map((contest, index) => {
    const overlap = contest.numbers.filter((number) => latestSet.has(number)).length;
    overlapCounts.set(overlap, (overlapCounts.get(overlap) ?? 0) + 1);
    const structure = structureForContest(contest, index > 0 ? contests[index - 1] : undefined, config);
    const structuralDistance =
      Math.abs(structure.odd - latestStructure.odd) / config.drawSize +
      Math.abs(structure.sum - latestStructure.sum) / (config.drawSize * config.maxNumber) +
      Math.abs(structure.low - latestStructure.low) / config.drawSize +
      Math.abs(structure.longestRun - latestStructure.longestRun) / config.drawSize;
    return {
      contest: contest.number,
      date: contest.date,
      overlap,
      sharedNumbers: contest.numbers.filter((number) => latestSet.has(number)).sort((a, b) => a - b),
      structuralDistance: round(structuralDistance),
    };
  });
  return {
    referenceContest: latest.number,
    overlapDistribution: [...overlapCounts.entries()].sort((a, b) => a[0] - b[0]).map(([overlap, count]) => ({ overlap, count })),
    closest: candidates.sort((a, b) => b.overlap - a.overlap || a.structuralDistance - b.structuralDistance || b.contest - a.contest).slice(0, 10),
  };
}

function aggregateValidation(rounds: Array<{
  hits: Record<NumberTier, number>;
  sizes: Record<NumberTier, number>;
}>, config: LotteryConfig, window: number) {
  const selected = rounds.slice(-window);
  const totalDrawn = selected.length * config.drawSize;
  const tiers = (["strong", "balanced", "cold"] as NumberTier[]).map((tier) => {
    const observedHits = selected.reduce((sum, round) => sum + round.hits[tier], 0);
    const expectedHits = selected.reduce((sum, round) => sum + config.drawSize * (round.sizes[tier] / numberRange(config).length), 0);
    const variance = selected.reduce((sum, round) => {
      const population = numberRange(config).length;
      const success = round.sizes[tier];
      const p = success / population;
      const finitePopulation = population <= 1 ? 0 : (population - config.drawSize) / (population - 1);
      return sum + config.drawSize * p * (1 - p) * finitePopulation;
    }, 0);
    const zScore = variance > 0 ? (observedHits - expectedHits) / Math.sqrt(variance) : 0;
    const pValue = twoSidedNormalP(zScore);
    const adjustedPValue = Math.min(1, pValue * 3);
    return {
      tier,
      observedHits,
      expectedHits: round(expectedHits),
      observedRate: totalDrawn === 0 ? 0 : round(observedHits / totalDrawn),
      expectedRate: totalDrawn === 0 ? 0 : round(expectedHits / totalDrawn),
      difference: totalDrawn === 0 ? 0 : round((observedHits - expectedHits) / totalDrawn),
      zScore: round(zScore),
      adjustedPValue: round(adjustedPValue, 8),
      evidence: evidenceLevel(adjustedPValue),
    };
  });
  return { window, rounds: selected.length, tiers };
}

function buildRollingValidation(contests: Contest[], config: LotteryConfig) {
  const rounds: Array<{
    contest: number;
    hits: Record<NumberTier, number>;
    sizes: Record<NumberTier, number>;
  }> = [];
  const start = Math.max(MIN_VALIDATION_HISTORY, contests.length - Math.max(...ANALYSIS_WINDOWS));
  for (let index = start; index < contests.length; index += 1) {
    const history = contests.slice(0, index);
    const target = contests[index]!;
    const rows = buildNumberAnalysis(history, config);
    const tiers = tierMap(rows);
    const sizes: Record<NumberTier, number> = {
      strong: rows.filter((row) => row.tier === "strong").length,
      balanced: rows.filter((row) => row.tier === "balanced").length,
      cold: rows.filter((row) => row.tier === "cold").length,
    };
    const hits: Record<NumberTier, number> = { strong: 0, balanced: 0, cold: 0 };
    for (const number of target.numbers) {
      const tier = tiers.get(number);
      if (tier) hits[tier] += 1;
    }
    rounds.push({ contest: target.number, hits, sizes });
  }

  return {
    periods: ANALYSIS_WINDOWS.map((window) => aggregateValidation(rounds, config, window)),
    availableRounds: rounds.length,
    methodology: {
      warmupContests: MIN_VALIDATION_HISTORY,
      leakageProtection: true,
      correction: "bonferroni-3-tiers",
      note: "Cada concurso é avaliado usando apenas concursos anteriores. O esperado usa a distribuição hipergeométrica implícita no tamanho de cada grupo, sem olhar o resultado futuro.",
    },
  };
}

export function buildAdvancedAnalysis(contests: Contest[], config: LotteryConfig) {
  const scoped = contests
    .filter((contest) => contest.lottery === config.id)
    .sort((a, b) => a.number - b.number);
  const currentRows = buildNumberAnalysis(scoped, config);
  const latest = scoped.at(-1) ?? null;
  const tiers = {
    strong: currentRows.filter((row) => row.tier === "strong").map((row) => row.number),
    balanced: currentRows.filter((row) => row.tier === "balanced").map((row) => row.number),
    cold: currentRows.filter((row) => row.tier === "cold").map((row) => row.number),
  };

  return {
    lottery: config.id,
    latestContest: latest,
    historySize: scoped.length,
    model: {
      weights: DEFAULT_WEIGHTS,
      baseline: "uniform-without-replacement",
      philosophy: "observed-vs-expected",
      disclaimer: "Histórico, atraso, frequência e estrutura descrevem os sorteios observados; não alteram a probabilidade matemática individual do próximo sorteio.",
    },
    ranking: {
      tiers,
      numbers: currentRows,
      dynamics: buildDynamics(scoped, config, currentRows),
    },
    structure: buildStructure(scoped, config),
    dynamics: {
      cycles: buildCycles(scoped, config),
      heatmap: scoped.slice(-30).map((contest) => ({ contest: contest.number, date: contest.date, numbers: sortedNumbers(contest) })),
    },
    combinations: buildAssociations(scoped, config),
    similarity: buildSimilarity(scoped, config),
    validation: buildRollingValidation(scoped, config),
  };
}
