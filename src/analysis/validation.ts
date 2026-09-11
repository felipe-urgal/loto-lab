import type {
  Contest,
  LotteryConfig,
  NumberAnalysis,
  NumberTier,
} from "../domain/types.js";
import { latestContinuousSegment } from "./continuity.js";
import { numberRange } from "./frequency.js";
import { buildNumberAnalysis } from "./scoring.js";
import { evidenceLevel, round, twoSidedNormalP } from "./statistics.js";

const ANALYSIS_WINDOWS = [100, 300, 500] as const;
const MIN_VALIDATION_HISTORY = 20;
const VALIDATION_COMPARISONS = ANALYSIS_WINDOWS.length * 3;

function tierMap(rows: NumberAnalysis[]): Map<number, NumberTier> {
  return new Map(rows.map((row) => [row.number, row.tier]));
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

export function buildRollingValidation(contests: Contest[], config: LotteryConfig) {
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
