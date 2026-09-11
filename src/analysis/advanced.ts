import type { Contest, LotteryConfig } from "../domain/types.js";
import { buildAssociations } from "./associations.js";
import { buildDataQuality, isConsecutive } from "./continuity.js";
import { buildCycles } from "./cycles.js";
import { buildDynamics } from "./dynamics.js";
import { buildNumberAnalysis, DEFAULT_WEIGHTS } from "./scoring.js";
import { round } from "./statistics.js";
import { buildStructure, structureForContest } from "./structure.js";
import { buildRollingValidation } from "./validation.js";

export { combination, exactBinomialTwoSidedP, hypergeometricDistribution } from "./statistics.js";
export type { EvidenceLevel } from "./statistics.js";

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
