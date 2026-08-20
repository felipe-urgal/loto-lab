import type { GameCheckResult } from "../checker/evaluate.js";

export interface BacktestSummary {
  testedContests: number;
  totalGames: number;
  averageHitsPerGame: number;
  averageFixedHitsPerContest: number;
  maxHits: number;
  bestHitDistribution: Record<number, number>;
  fixedHitDistribution: Record<number, number>;
  prizeTierDistribution: Record<string, number>;
  prizeGames: number;
  prizeRate: number;
  totalCost: number;
  financialCost: number;
  totalPrizeValue: number;
  financialGames: number;
  financialCoverage: number;
  netResult: number;
  returnRate: number;
  roi: number;
}

export interface SummarizableRound {
  checks: GameCheckResult[];
}

function incrementNumber(distribution: Record<number, number>, value: number): void {
  distribution[value] = (distribution[value] ?? 0) + 1;
}

function incrementString(distribution: Record<string, number>, value: string): void {
  distribution[value] = (distribution[value] ?? 0) + 1;
}

export function summarizeBacktestRounds(rounds: SummarizableRound[]): BacktestSummary {
  const bestHitDistribution: Record<number, number> = {};
  const fixedHitDistribution: Record<number, number> = {};
  const prizeTierDistribution: Record<string, number> = {};
  let totalHits = 0;
  let totalFixedHits = 0;
  let totalGames = 0;
  let maxHits = 0;
  let prizeGames = 0;
  let totalCost = 0;
  let financialCost = 0;
  let totalPrizeValue = 0;
  let financialGames = 0;

  for (const round of rounds) {
    if (round.checks.length === 0) continue;
    const bestHits = Math.max(...round.checks.map((check) => check.hits));
    const fixedHits = round.checks[0]!.fixedHits;
    incrementNumber(bestHitDistribution, bestHits);
    incrementNumber(fixedHitDistribution, fixedHits);
    totalFixedHits += fixedHits;

    for (const check of round.checks) {
      totalHits += check.hits;
      totalGames += 1;
      maxHits = Math.max(maxHits, check.hits);
      totalCost += check.ticketCost;
      if (check.prizeTier) {
        incrementString(prizeTierDistribution, check.prizeTier);
        prizeGames += 1;
      }
      if (check.totalPrizeValue !== undefined) {
        totalPrizeValue += check.totalPrizeValue;
        financialCost += check.ticketCost;
        financialGames += 1;
      }
    }
  }

  const financialCoverage = totalGames === 0 ? 0 : financialGames / totalGames;
  const netResult = totalPrizeValue - financialCost;
  const returnRate = financialCost === 0 ? 0 : totalPrizeValue / financialCost;
  const roi = financialCost === 0 ? 0 : netResult / financialCost;

  return {
    testedContests: rounds.length,
    totalGames,
    averageHitsPerGame: totalGames === 0 ? 0 : totalHits / totalGames,
    averageFixedHitsPerContest: rounds.length === 0 ? 0 : totalFixedHits / rounds.length,
    maxHits,
    bestHitDistribution,
    fixedHitDistribution,
    prizeTierDistribution,
    prizeGames,
    prizeRate: totalGames === 0 ? 0 : prizeGames / totalGames,
    totalCost,
    financialCost,
    totalPrizeValue,
    financialGames,
    financialCoverage,
    netResult,
    returnRate,
    roi,
  };
}
