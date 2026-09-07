import type { Contest, LotteryConfig } from "../domain/types.js";
import { isConsecutive } from "./continuity.js";
import { numberRange } from "./frequency.js";
import {
  combination,
  expectedFromDistribution,
  hypergeometricDistribution,
  mean,
  percentileRank,
  round,
  summarize,
  varianceFromDistribution,
} from "./statistics.js";
import type { DistributionSummary, ProbabilityPoint } from "./statistics.js";

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
  repeated: number | null;
  low: number;
  high: number;
  longestRun: number;
  lines?: number[];
  columns?: number[];
  frame?: number;
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

export function structureForContest(
  contest: Contest,
  previous: Contest | undefined,
  config: LotteryConfig,
): ContestStructure {
  const numbers = [...contest.numbers].sort((a, b) => a - b);
  const validPrevious = isConsecutive(previous, contest) ? previous : undefined;
  const previousSet = new Set(validPrevious?.numbers ?? []);
  const midpoint = Math.floor((config.minNumber + config.maxNumber) / 2);
  const odd = numbers.filter((number) => number % 2 !== 0).length;
  const repeated = validPrevious
    ? numbers.filter((number) => previousSet.has(number)).length
    : null;
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

export function buildStructure(contests: Contest[], config: LotteryConfig) {
  const structures = contests.map((contest, index) =>
    structureForContest(contest, index > 0 ? contests[index - 1] : undefined, config),
  );
  const latest = structures.at(-1);
  const repeatValues = structures.flatMap((item) => item.repeated === null ? [] : [item.repeated]);
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

  const latestContest = contests.at(-1);
  const exactCoverage = latestContest ? exactFilterCoverage(config, latestContest.numbers) : null;
  const ranges = exactCoverage?.ranges ?? methodologyRanges(config);
  const historicalTransitions = structures.filter((item) => item.repeated !== null);
  const historicalPassing = historicalTransitions.filter((item) =>
    item.repeated! >= ranges.repeated.min && item.repeated! <= ranges.repeated.max &&
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
        ? { frame: structuralMetric(latest?.frame ?? null, frameValues, frameDistribution) }
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
      rules: { repeated: ranges.repeated, odd: ranges.odd },
      exactUniverse: exactCoverage
        ? {
            passing: exactCoverage.passing,
            total: exactCoverage.total,
            coverage: round(exactCoverage.coverage),
          }
        : null,
      historical: {
        passing: historicalPassing,
        total: historicalTransitions.length,
        coverage: historicalTransitions.length === 0
          ? null
          : round(historicalPassing / historicalTransitions.length),
      },
      note: "Cobertura exata considera apenas repetição e paridade. Transições com concursos faltantes são excluídas; soma e demais estruturas permanecem descritivas.",
    },
  };
}
