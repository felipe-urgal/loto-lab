import type { Contest, LotteryConfig, NumberAnalysis, NumberTier } from "../domain/types.js";
import { numberRange } from "./frequency.js";
import { buildNumberAnalysis } from "./scoring.js";
import type { buildAdvancedAnalysis } from "./advanced.js";

export const MIN_EVIDENCE_ROUNDS = 30;
export const MIN_ASSOCIATION_HISTORY = 20;

type AdvancedAnalysis = ReturnType<typeof buildAdvancedAnalysis>;
type MutableAdvanced = any;

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  const weight = position - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function summarize(values: number[]) {
  if (values.length === 0) return null;
  return {
    mean: round(mean(values)!),
    min: Math.min(...values),
    max: Math.max(...values),
    p10: round(quantile(values, 0.1)!),
    p50: round(quantile(values, 0.5)!),
    p90: round(quantile(values, 0.9)!),
  };
}

function percentileRank(value: number, values: number[]): number | null {
  if (values.length === 0) return null;
  return round(values.filter((candidate) => candidate <= value).length / values.length);
}

function combination(n: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) return 0;
  const selected = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= selected; index += 1) {
    result = (result * (n - selected + index)) / index;
  }
  return result;
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
  return {
    passing,
    total,
    coverage: total === 0 ? 0 : passing / total,
    ranges,
  };
}

function isConsecutive(previous: Contest | undefined, current: Contest | undefined): boolean {
  return Boolean(previous && current && current.number === previous.number + 1);
}

function splitContinuousSegments(contests: Contest[]): Contest[][] {
  if (contests.length === 0) return [];
  const segments: Contest[][] = [[contests[0]!]];
  for (let index = 1; index < contests.length; index += 1) {
    const contest = contests[index]!;
    const previous = contests[index - 1]!;
    if (isConsecutive(previous, contest)) segments.at(-1)!.push(contest);
    else segments.push([contest]);
  }
  return segments;
}

function latestContinuousSegment(contests: Contest[]): Contest[] {
  return splitContinuousSegments(contests).at(-1) ?? [];
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

function contestStructure(contest: Contest, previous: Contest | undefined, config: LotteryConfig) {
  const numbers = [...contest.numbers].sort((a, b) => a - b);
  const validPrevious = isConsecutive(previous, contest) ? previous : undefined;
  const previousSet = new Set(validPrevious?.numbers ?? []);
  const midpoint = Math.floor((config.minNumber + config.maxNumber) / 2);
  const odd = numbers.filter((number) => number % 2 !== 0).length;
  const repeated = validPrevious
    ? numbers.filter((number) => previousSet.has(number)).length
    : null;
  const low = numbers.filter((number) => number <= midpoint).length;
  let frame: number | undefined;
  let lines: number[] | undefined;
  let columns: number[] | undefined;

  if (config.id === "lotofacil") {
    lines = Array.from({ length: 5 }, () => 0);
    columns = Array.from({ length: 5 }, () => 0);
    frame = 0;
    for (const number of numbers) {
      const zeroBased = number - 1;
      const row = Math.floor(zeroBased / 5);
      const column = zeroBased % 5;
      lines[row] = (lines[row] ?? 0) + 1;
      columns[column] = (columns[column] ?? 0) + 1;
      if (row === 0 || row === 4 || column === 0 || column === 4) frame += 1;
    }
  }

  return {
    odd,
    sum: numbers.reduce((total, number) => total + number, 0),
    repeated,
    low,
    longestRun: longestConsecutiveRun(numbers),
    frame,
    lines,
    columns,
  };
}

function overwriteObservedMetric(metric: any, current: number | null | undefined, values: number[]) {
  metric.observed = summarize(values);
  const percentile = typeof current === "number" ? percentileRank(current, values) : null;
  if (percentile === null) delete metric.percentile;
  else metric.percentile = percentile;
}

function hardenStructure(result: MutableAdvanced, contests: Contest[], config: LotteryConfig) {
  const filter = result.structure.methodologyFilter as any;
  const latest = contests.at(-1);
  const nextCoverage = latest ? exactFilterCoverage(config, latest.numbers) : null;
  filter.nextContestUniverse = nextCoverage
    ? {
        passing: nextCoverage.passing,
        total: nextCoverage.total,
        coverage: round(nextCoverage.coverage),
      }
    : null;
  filter.exactUniverse = filter.nextContestUniverse;

  const transitionCoverages: number[] = [];
  for (let index = 1; index < contests.length; index += 1) {
    const previous = contests[index - 1]!;
    const current = contests[index]!;
    if (!isConsecutive(previous, current)) continue;
    transitionCoverages.push(exactFilterCoverage(config, previous.numbers).coverage);
  }
  filter.historicalExpected = transitionCoverages.length
    ? {
        total: transitionCoverages.length,
        coverage: round(mean(transitionCoverages)!),
        minCoverage: round(Math.min(...transitionCoverages)),
        maxCoverage: round(Math.max(...transitionCoverages)),
      }
    : null;
  filter.note = "A cobertura do próximo concurso usa o último sorteio como referência. A comparação histórica usa, para cada transição contínua N-1 → N, o baseline combinatório condicionado ao próprio N-1; soma e demais estruturas permanecem descritivas.";

  const historicalContests = contests.slice(0, -1);
  const historicalStructures = historicalContests.map((contest, index) =>
    contestStructure(contest, index > 0 ? historicalContests[index - 1] : undefined, config),
  );
  const current = result.structure.current as any;
  overwriteObservedMetric(
    result.structure.metrics.repeated,
    current?.repeated,
    historicalStructures.flatMap((item) => item.repeated === null ? [] : [item.repeated]),
  );
  overwriteObservedMetric(result.structure.metrics.odd, current?.odd, historicalStructures.map((item) => item.odd));
  overwriteObservedMetric(result.structure.metrics.sum, current?.sum, historicalStructures.map((item) => item.sum));
  overwriteObservedMetric(result.structure.metrics.low, current?.low, historicalStructures.map((item) => item.low));
  overwriteObservedMetric(
    result.structure.metrics.longestRun,
    current?.longestRun,
    historicalStructures.map((item) => item.longestRun),
  );
  if (result.structure.metrics.frame) {
    overwriteObservedMetric(
      result.structure.metrics.frame,
      current?.frame,
      historicalStructures.flatMap((item) => typeof item.frame === "number" ? [item.frame] : []),
    );
  }

  if (config.id === "lotofacil") {
    if (!latest) {
      result.structure.grid = null;
    } else if (result.structure.grid) {
      const lineMeans = Array.from({ length: 5 }, (_, index) => {
        const value = mean(historicalStructures.flatMap((item) => item.lines ? [item.lines[index] ?? 0] : []));
        return value === null ? null : round(value);
      });
      const columnMeans = Array.from({ length: 5 }, (_, index) => {
        const value = mean(historicalStructures.flatMap((item) => item.columns ? [item.columns[index] ?? 0] : []));
        return value === null ? null : round(value);
      });
      result.structure.grid.historicalLineMean = lineMeans;
      result.structure.grid.historicalColumnMean = columnMeans;
    }
  }
}

function rankMap(rows: NumberAnalysis[]): Map<number, number> {
  return new Map(
    [...rows]
      .sort((a, b) => b.score - a.score || a.number - b.number)
      .map((row, index) => [row.number, index + 1]),
  );
}

function tierMap(rows: NumberAnalysis[]): Map<number, NumberTier> {
  return new Map(rows.map((row) => [row.number, row.tier]));
}

function hardenRankingDynamics(result: MutableAdvanced, contests: Contest[], config: LotteryConfig) {
  const latest = contests.at(-1);
  const items = result.ranking.dynamics.items as any[];
  const currentRanks = new Map(items.map((item) => [item.number, item.rank]));
  const referenceRanks = new Map<number, Map<number, number>>();

  if (latest) {
    for (const offset of [1, 5, 10, 20]) {
      const targetNumber = latest.number - offset;
      const targetIndex = contests.findIndex((contest) => contest.number === targetNumber);
      if (targetIndex >= 0) {
        referenceRanks.set(offset, rankMap(buildNumberAnalysis(contests.slice(0, targetIndex + 1), config)));
      }
    }
  }

  const continuousRecent = latestContinuousSegment(contests).slice(-10);
  const recentTierSnapshots: Array<Map<number, NumberTier>> = [];
  for (const contest of continuousRecent) {
    const targetIndex = contests.findIndex((candidate) => candidate.number === contest.number);
    if (targetIndex >= 0) {
      recentTierSnapshots.push(tierMap(buildNumberAnalysis(contests.slice(0, targetIndex + 1), config)));
    }
  }

  for (const item of items) {
    const rank = currentRanks.get(item.number) ?? item.rank;
    const previousRanks = {
      one: referenceRanks.get(1)?.get(item.number) ?? null,
      five: referenceRanks.get(5)?.get(item.number) ?? null,
      ten: referenceRanks.get(10)?.get(item.number) ?? null,
      twenty: referenceRanks.get(20)?.get(item.number) ?? null,
    };
    const movement = (previous: number | null) => previous === null ? null : previous - rank;
    item.previousRanks = previousRanks;
    item.movements = {
      one: movement(previousRanks.one),
      five: movement(previousRanks.five),
      ten: movement(previousRanks.ten),
      twenty: movement(previousRanks.twenty),
    };
    item.trend = item.movements.ten === null
      ? "unknown"
      : item.movements.ten >= 5
        ? "rising"
        : item.movements.ten <= -5
          ? "falling"
          : "stable";

    if (recentTierSnapshots.length === 0) {
      item.recentTierStability = null;
      item.recentStrongShare = null;
    } else {
      const sameTier = recentTierSnapshots.filter((snapshot) => snapshot.get(item.number) === item.tier).length;
      const strong = recentTierSnapshots.filter((snapshot) => snapshot.get(item.number) === "strong").length;
      item.recentTierStability = round(sameTier / recentTierSnapshots.length);
      item.recentStrongShare = round(strong / recentTierSnapshots.length);
    }
  }

  const movers = [...items]
    .filter((item) => item.movements.ten !== null)
    .sort((a, b) => (b.movements.ten ?? 0) - (a.movements.ten ?? 0));
  result.ranking.dynamics.movers = {
    rising: movers
      .filter((item) => (item.movements.ten ?? 0) > 0)
      .slice(0, 8)
      .map((item) => ({ number: item.number, movement: item.movements.ten, rank: item.rank })),
    falling: [...movers]
      .reverse()
      .filter((item) => (item.movements.ten ?? 0) < 0)
      .slice(0, 8)
      .map((item) => ({ number: item.number, movement: item.movements.ten, rank: item.rank })),
  };
}

function buildCycles(contests: Contest[], config: LotteryConfig, leftCensored: boolean) {
  const universe = numberRange(config);
  const completedLengths: number[] = [];
  const segments = splitContinuousSegments(contests);
  let current: any = {
    available: contests.length > 0,
    currentLength: 0,
    seen: 0,
    missing: [...universe],
  };

  segments.forEach((segment, segmentIndex) => {
    const seen = new Set<number>();
    let currentLength = 0;
    let currentKnown = segmentIndex === 0 && !leftCensored;
    for (const contest of segment) {
      currentLength += 1;
      for (const number of contest.numbers) seen.add(number);
      if (seen.size === universe.length) {
        if (currentKnown) completedLengths.push(currentLength);
        seen.clear();
        currentLength = 0;
        currentKnown = true;
      }
    }
    if (segmentIndex === segments.length - 1) {
      current = currentKnown
        ? {
            available: true,
            currentLength,
            seen: seen.size,
            missing: universe.filter((number) => !seen.has(number)),
          }
        : {
            available: false,
            currentLength: null,
            seen: null,
            missing: [],
          };
    }
  });

  return {
    ...current,
    completedCount: completedLengths.length,
    historicalLength: summarize(completedLengths),
  };
}

function hardenDataQuality(result: MutableAdvanced, contests: Contest[], config: LotteryConfig) {
  const first = contests.at(0);
  const leftCensored = Boolean(first && first.number > 1);
  result.dataQuality.firstStoredContest = first?.number ?? null;
  result.dataQuality.leftCensored = leftCensored;

  if (leftCensored && contests.length > 0) {
    const segment = latestContinuousSegment(contests);
    const segmentIsWholeHistory = segment.length === contests.length;
    if (segmentIsWholeHistory) {
      for (const item of result.ranking.dynamics.items as any[]) {
        const appears = segment.some((contest) => contest.numbers.includes(item.number));
        const appearsEverywhere = segment.every((contest) => contest.numbers.includes(item.number));
        if (!appears && item.delay?.current === segment.length) {
          item.delay.current = null;
          item.delay.percentile = null;
        }
        if (appearsEverywhere && item.streak === segment.length) item.streak = null;
      }
    }
  }

  result.dynamics.cycles = buildCycles(contests, config, leftCensored);
}

function hardenValidation(result: MutableAdvanced) {
  result.validation.methodology.minimumEvidenceRounds = MIN_EVIDENCE_ROUNDS;
  for (const period of result.validation.periods as any[]) {
    period.evidenceEligible = period.rounds >= MIN_EVIDENCE_ROUNDS;
    if (!period.evidenceEligible) {
      for (const tier of period.tiers) tier.evidence = "none";
    }
  }
}

function hardenAssociations(result: MutableAdvanced, contests: Contest[]) {
  result.combinations.methodology.minimumContests = MIN_ASSOCIATION_HISTORY;
  result.combinations.methodology.availableContests = contests.length;
  result.combinations.methodology.note = `${result.combinations.methodology.note} A correção de Bonferroni é aplicada separadamente à família de pares e à família de trincas.`;
  if (contests.length >= MIN_ASSOCIATION_HISTORY) return;
  result.combinations.pairs = [];
  result.combinations.highlights = {
    positivePairs: [],
    negativePairs: [],
    positiveTriples: [],
  };
}

export function hardenAdvancedAnalysis(
  analysis: AdvancedAnalysis,
  contests: Contest[],
  config: LotteryConfig,
): AdvancedAnalysis {
  const scoped = contests
    .filter((contest) => contest.lottery === config.id)
    .sort((a, b) => a.number - b.number);
  const result = analysis as MutableAdvanced;

  hardenStructure(result, scoped, config);
  hardenRankingDynamics(result, scoped, config);
  hardenDataQuality(result, scoped, config);
  hardenValidation(result);
  hardenAssociations(result, scoped);

  return result as AdvancedAnalysis;
}
