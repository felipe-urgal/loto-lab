import type {
  AnalysisWeights,
  Contest,
  LotteryConfig,
  NumberAnalysis,
  NumberTier,
} from "../domain/types.js";
import { buildAssociations } from "./associations.js";
import {
  buildDataQuality,
  isConsecutive,
  latestContinuousSegment,
  splitContinuousSegments,
} from "./continuity.js";
import { buildCycles } from "./cycles.js";
import { calculateFrequency, numberRange } from "./frequency.js";
import { buildNumberAnalysis, DEFAULT_WEIGHTS } from "./scoring.js";
import {
  evidenceLevel,
  percentileRank,
  round,
  summarize,
  twoSidedNormalP,
} from "./statistics.js";
import { buildStructure, structureForContest } from "./structure.js";

export { combination, exactBinomialTwoSidedP, hypergeometricDistribution } from "./statistics.js";
export type { EvidenceLevel } from "./statistics.js";

const ANALYSIS_WINDOWS = [100, 300, 500] as const;
const MIN_VALIDATION_HISTORY = 20;
const WEIGHT_MULTIPLIERS = [0.9, 1, 1.1] as const;
const VALIDATION_COMPARISONS = ANALYSIS_WINDOWS.length * 3;

function sortedNumbers(contest: Contest): number[] {
  return [...contest.numbers].sort((a, b) => a - b);
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

function currentDelay(contests: Contest[], number: number): number | null {
  const segment = latestContinuousSegment(contests);
  if (segment.length === 0) return null;
  for (let index = segment.length - 1; index >= 0; index -= 1) {
    if (segment[index]!.numbers.includes(number)) return segment.length - index - 1;
  }
  return segment.length === contests.length ? segment.length : null;
}

function currentStreak(contests: Contest[], number: number): number | null {
  const segment = latestContinuousSegment(contests);
  if (segment.length === 0) return null;
  let streak = 0;
  for (let index = segment.length - 1; index >= 0; index -= 1) {
    if (!segment[index]!.numbers.includes(number)) return streak;
    streak += 1;
  }
  return segment.length === contests.length ? streak : null;
}

function historicalDelays(contests: Contest[], number: number): number[] {
  const delays: number[] = [];
  for (const segment of splitContinuousSegments(contests)) {
    const occurrenceIndexes = segment
      .map((contest, index) => contest.numbers.includes(number) ? index : -1)
      .filter((index) => index >= 0);
    for (let index = 1; index < occurrenceIndexes.length; index += 1) {
      delays.push(occurrenceIndexes[index]! - occurrenceIndexes[index - 1]! - 1);
    }
  }
  return delays;
}

function weightScenarios(base: AnalysisWeights): AnalysisWeights[] {
  const keys = ["year", "recent20", "month", "historical", "recent10"] as const;
  const scenarios: AnalysisWeights[] = [];

  function visit(index: number, multipliers: number[]) {
    if (index === keys.length) {
      const raw = Object.fromEntries(
        keys.map((key, keyIndex) => [key, base[key] * multipliers[keyIndex]!]),
      ) as unknown as AnalysisWeights;
      const total = keys.reduce((sum, key) => sum + raw[key], 0);
      scenarios.push(Object.fromEntries(
        keys.map((key) => [key, raw[key] / total]),
      ) as unknown as AnalysisWeights);
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

function robustnessByNumber(rows: NumberAnalysis[], weights: AnalysisWeights, enabled: boolean) {
  const numbers = rows.map((row) => row.number);
  if (!enabled) {
    const ranks = rankMap(rows);
    return new Map(numbers.map((number) => [number, {
      scenarioCount: 0,
      tierStability: null,
      strongShare: null,
      rankRange: [ranks.get(number) ?? 0, ranks.get(number) ?? 0] as [number, number],
    }]));
  }

  const currentTiers = tierMap(rows);
  const scenarios = weightScenarios(weights);
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
  if (contests.length > 0) {
    const firstSnapshot = Math.max(1, contests.length - 9);
    for (let length = firstSnapshot; length <= contests.length; length += 1) {
      recentTierSnapshots.push(tierMap(buildNumberAnalysis(contests.slice(0, length), config)));
    }
  }

  const robustness = robustnessByNumber(currentRows, DEFAULT_WEIGHTS, contests.length > 0);
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
      previousRanks: {
        one: rank1 ?? null,
        five: rank5 ?? null,
        ten: rank10 ?? null,
        twenty: rank20 ?? null,
      },
      movements: {
        one: movement(rank1),
        five: movement(rank5),
        ten: movement10,
        twenty: movement(rank20),
      },
      trend: movement10 === null
        ? "unknown"
        : movement10 >= 5
          ? "rising"
          : movement10 <= -5
            ? "falling"
            : "stable",
      recentTierStability: recentTierSnapshots.length === 0
        ? null
        : round(sameTierCount / recentTierSnapshots.length),
      recentStrongShare: recentTierSnapshots.length === 0
        ? null
        : round(strongCount / recentTierSnapshots.length),
      weightRobustness: robustnessItem,
      delay: {
        current: delay,
        percentile: delay === null ? null : percentileRank(delay, delays) ?? null,
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
      rising: movers
        .filter((item) => (item.movements.ten ?? 0) > 0)
        .slice(0, 8)
        .map((item) => ({ number: item.number, movement: item.movements.ten, rank: item.rank })),
      falling: [...movers]
        .reverse()
        .filter((item) => (item.movements.ten ?? 0) < 0)
        .slice(0, 8)
        .map((item) => ({ number: item.number, movement: item.movements.ten, rank: item.rank })),
    },
  };
}

function buildSimilarity(contests: Contest[], config: LotteryConfig) {
  const latest = contests.at(-1);
  if (!latest) return { overlapDistribution: [], closest: [] };
  const latestSet = new Set(latest.numbers);
  const latestStructure = structureForContest(
    latest,
    isConsecutive(contests.at(-2), latest) ? contests.at(-2) : undefined,
    config,
  );
  const overlapCounts = new Map<number, number>();
  const candidates = contests.slice(0, -1).map((contest, index) => {
    const overlap = contest.numbers.filter((number) => latestSet.has(number)).length;
    overlapCounts.set(overlap, (overlapCounts.get(overlap) ?? 0) + 1);
    const previous = index > 0 && isConsecutive(contests[index - 1], contest)
      ? contests[index - 1]
      : undefined;
    const structure = structureForContest(contest, previous, config);
    const structuralDistance =
      Math.abs(structure.odd - latestStructure.odd) / config.drawSize +
      Math.abs(structure.sum - latestStructure.sum) / (config.drawSize * config.maxNumber) +
      Math.abs(structure.low - latestStructure.low) / config.drawSize +
      Math.abs(structure.longestRun - latestStructure.longestRun) / config.drawSize;
    return {
      contest: contest.number,
      date: contest.date,
      overlap,
      sharedNumbers: contest.numbers
        .filter((number) => latestSet.has(number))
        .sort((a, b) => a - b),
      structuralDistance: round(structuralDistance),
    };
  });
  return {
    referenceContest: latest.number,
    overlapDistribution: [...overlapCounts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([overlap, count]) => ({ overlap, count })),
    closest: candidates
      .sort((a, b) =>
        b.overlap - a.overlap ||
        a.structuralDistance - b.structuralDistance ||
        b.contest - a.contest,
      )
      .slice(0, 10),
  };
}

function aggregateValidation(
  rounds: Array<{
    hits: Record<NumberTier, number>;
    sizes: Record<NumberTier, number>;
  }>,
  config: LotteryConfig,
  window: number,
) {
  const selected = rounds.slice(-window);
  const population = numberRange(config).length;
  const totalDrawn = selected.length * config.drawSize;
  const tiers = (["strong", "balanced", "cold"] as NumberTier[]).map((tier) => {
    const observedHits = selected.reduce((sum, round) => sum + round.hits[tier], 0);
    const expectedHits = selected.reduce(
      (sum, round) => sum + config.drawSize * (round.sizes[tier] / population),
      0,
    );
    const variance = selected.reduce((sum, round) => {
      const success = round.sizes[tier];
      const p = success / population;
      const finitePopulation = population <= 1
        ? 0
        : (population - config.drawSize) / (population - 1);
      return sum + config.drawSize * p * (1 - p) * finitePopulation;
    }, 0);
    const zScore = variance > 0 ? (observedHits - expectedHits) / Math.sqrt(variance) : 0;
    const pValue = twoSidedNormalP(zScore);
    const adjustedPValue = Math.min(1, pValue * VALIDATION_COMPARISONS);
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
  const validationContests = latestContinuousSegment(contests);
  const rounds: Array<{
    contest: number;
    hits: Record<NumberTier, number>;
    sizes: Record<NumberTier, number>;
  }> = [];
  const start = Math.max(
    MIN_VALIDATION_HISTORY,
    validationContests.length - Math.max(...ANALYSIS_WINDOWS),
  );
  for (let index = start; index < validationContests.length; index += 1) {
    const history = validationContests.slice(0, index);
    const target = validationContests[index]!;
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
    sourceContests: validationContests.length,
    methodology: {
      warmupContests: MIN_VALIDATION_HISTORY,
      leakageProtection: true,
      requiresContinuousHistory: true,
      correction: `bonferroni-${VALIDATION_COMPARISONS}-tests`,
      note: "Cada concurso é avaliado usando apenas concursos anteriores do trecho contínuo mais recente. O esperado usa a distribuição hipergeométrica implícita no tamanho de cada grupo; a correção cobre 3 grupos × 3 janelas.",
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
    dataQuality: buildDataQuality(scoped),
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
      heatmap: scoped.slice(-30).map((contest) => ({
        contest: contest.number,
        date: contest.date,
        numbers: sortedNumbers(contest),
      })),
    },
    combinations: buildAssociations(scoped, config),
    similarity: buildSimilarity(scoped, config),
    validation: buildRollingValidation(scoped, config),
  };
}
