import type { Contest, LotteryConfig, NumberTier } from "../domain/types.js";
import { buildAssociations } from "./associations.js";
import { buildDataQuality, isConsecutive, latestContinuousSegment } from "./continuity.js";
import { buildCycles } from "./cycles.js";
import { buildDynamics, tierMap } from "./dynamics.js";
import { numberRange } from "./frequency.js";
import { buildNumberAnalysis, DEFAULT_WEIGHTS } from "./scoring.js";
import { evidenceLevel, round, twoSidedNormalP } from "./statistics.js";
import { buildStructure, structureForContest } from "./structure.js";

export { combination, exactBinomialTwoSidedP, hypergeometricDistribution } from "./statistics.js";
export type { EvidenceLevel } from "./statistics.js";

const ANALYSIS_WINDOWS = [100, 300, 500] as const;
const MIN_VALIDATION_HISTORY = 20;
const VALIDATION_COMPARISONS = ANALYSIS_WINDOWS.length * 3;

function sortedNumbers(contest: Contest): number[] {
  return [...contest.numbers].sort((a, b) => a - b);
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
