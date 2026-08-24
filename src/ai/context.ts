import type { Pool } from "pg";
import type { LotteryId } from "../domain/types.js";
import { buildNumberAnalysis, DEFAULT_WEIGHTS } from "../analysis/scoring.js";
import { getLotteryConfig } from "../lotteries/config.js";
import type { StrategyLabResult } from "../lab/strategyLab.js";
import { PostgresContestRepository } from "../persistence/contestRepository.js";
import { PostgresBacktestRepository } from "../persistence/backtestRepository.js";
import { PostgresRealBetRepository } from "../persistence/realBetRepository.js";
import { PostgresAnalysisJobRepository } from "../persistence/analysisJobRepository.js";
import type {
  AiEvidenceContext,
  AiNumberEvidence,
  AiStrategyVariantEvidence,
} from "./types.js";

function numberEvidence(row: ReturnType<typeof buildNumberAnalysis>[number]): AiNumberEvidence {
  return {
    number: row.number,
    score: row.score,
    tier: row.tier,
    year: row.year,
    month: row.month,
    recent10: row.recent10,
    recent20: row.recent20,
    historical: row.historical,
  };
}

function strategyLabFromResult(value: Record<string, unknown> | undefined): StrategyLabResult | undefined {
  if (!value || value.schemaVersion !== 2 || !Array.isArray(value.variants) || !value.benchmark) return undefined;
  return value as unknown as StrategyLabResult;
}

export async function buildAiEvidenceContext(
  pool: Pool,
  lottery: LotteryId,
): Promise<AiEvidenceContext> {
  const contestsRepository = new PostgresContestRepository(pool);
  const backtestsRepository = new PostgresBacktestRepository(pool);
  const realBetsRepository = new PostgresRealBetRepository(pool);
  const jobsRepository = new PostgresAnalysisJobRepository(pool);

  const contests = await contestsRepository.list({ lottery, order: "asc" });
  const latestContest = contests.at(-1);
  const analysisRows = buildNumberAnalysis(contests, getLotteryConfig(lottery));
  const ranked = [...analysisRows].sort((a, b) => b.score - a.score || a.number - b.number);
  const [latestBacktests, realPerformance, recentRealBets, latestStrategyLabJob] = await Promise.all([
    backtestsRepository.listRecentSummaries(lottery, 1),
    realBetsRepository.summary(lottery),
    realBetsRepository.listRecent(lottery, 5),
    jobsRepository.latestCompleted("strategy-lab", lottery),
  ]);

  const lab = strategyLabFromResult(latestStrategyLabJob?.result);
  let strategyLab: AiEvidenceContext["strategyLab"];
  if (lab && latestStrategyLabJob) {
    const variants: AiStrategyVariantEvidence[] = lab.variants.map((variant) => ({
      key: variant.key,
      label: variant.label,
      fixedCount: variant.fixedCount,
      averageHitsPerGame: variant.summary.averageHitsPerGame,
      averageFixedHitsPerContest: variant.summary.averageFixedHitsPerContest,
      maxHits: variant.summary.maxHits,
      prizeRate: variant.summary.prizeRate,
      roi: variant.summary.roi,
      financialCoverage: variant.summary.financialCoverage,
      netResult: variant.summary.netResult,
    }));
    strategyLab = {
      sourceJobId: latestStrategyLabJob.id,
      ...(lab.startContest !== undefined ? { startContest: lab.startContest } : {}),
      ...(lab.endContest !== undefined ? { endContest: lab.endContest } : {}),
      gameCount: lab.gameCount,
      rankingBasis: lab.rankingBasis,
      ...(lab.winner ? { bestInPeriod: lab.winner } : {}),
      benchmark: {
        status: lab.benchmark.status,
        basis: lab.benchmark.basis,
        adjustedPValue: lab.benchmark.adjustedPValue,
        lowerAdjustedPValue: lab.benchmark.lowerAdjustedPValue,
        strategyPercentile: lab.benchmark.strategyPercentile,
        resolutionSufficient: lab.benchmark.resolutionSufficient,
        sampleSizeSufficient: lab.benchmark.sampleSizeSufficient,
        observationRounds: lab.benchmark.observationRounds,
        minimumObservationRounds: lab.benchmark.minimumObservationRounds,
        randomSamples: lab.randomSamples,
        familySize: lab.benchmark.familySize,
      },
      variants,
    };
  }

  const latestBacktest = latestBacktests[0];
  return {
    lottery,
    generatedAt: new Date().toISOString(),
    ...(latestContest
      ? { latestContest: { number: latestContest.number, date: latestContest.date } }
      : {}),
    analysis: {
      weights: { ...DEFAULT_WEIGHTS },
      tierCounts: {
        strong: analysisRows.filter((row) => row.tier === "strong").length,
        balanced: analysisRows.filter((row) => row.tier === "balanced").length,
        cold: analysisRows.filter((row) => row.tier === "cold").length,
      },
      strongest: ranked.slice(0, 5).map(numberEvidence),
      coldest: ranked.slice(-5).reverse().map(numberEvidence),
    },
    ...(latestBacktest
      ? {
          latestBacktest: {
            id: latestBacktest.id,
            createdAt: latestBacktest.createdAt,
            options: latestBacktest.options,
            summary: latestBacktest.summary,
          },
        }
      : {}),
    ...(strategyLab ? { strategyLab } : {}),
    realPerformance: {
      totalBets: realPerformance.totalBets,
      checkedBets: realPerformance.checkedBets,
      financiallyCheckedBets: realPerformance.financiallyCheckedBets,
      pendingBets: realPerformance.pendingBets,
      actualCost: realPerformance.actualCost,
      checkedCost: realPerformance.checkedCost,
      totalPrizeValue: realPerformance.totalPrizeValue,
      netResult: realPerformance.netResult,
      ...(realPerformance.roi !== undefined ? { roi: realPerformance.roi } : {}),
    },
    recentRealBets: recentRealBets.map((bet) => ({
      contestNumber: bet.contestNumber,
      status: bet.status,
      actualCost: bet.actualCost,
      ...(bet.totalPrizeValue !== undefined ? { totalPrizeValue: bet.totalPrizeValue } : {}),
      ...(bet.netResult !== undefined ? { netResult: bet.netResult } : {}),
    })),
  };
}
