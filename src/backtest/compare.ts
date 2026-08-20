import type { Contest } from "../domain/types.js";
import { backtestLotofacil } from "./lotofacil.js";

export interface StrategyComparisonRow {
  name: string;
  averageHitsPerGame: number;
  averageFixedHitsPerContest: number;
  maxHits: number;
  prizeGames: number;
  prizeRate: number;
  testedContests: number;
  totalGames: number;
}

export interface LotofacilComparisonOptions {
  gameCount?: number;
  warmupContests?: number;
  startContest?: number;
  endContest?: number;
}

export function compareLotofacilFixedCores(
  contests: Contest[],
  options: LotofacilComparisonOptions = {},
): StrategyComparisonRow[] {
  const fixedCounts = [8, 9, 10] as const;

  return fixedCounts
    .map((fixedCount) => {
      const result = backtestLotofacil(contests, {
        ...options,
        fixedCount,
      });

      return {
        name: `lotofacil-${fixedCount}-fixas`,
        averageHitsPerGame: result.summary.averageHitsPerGame,
        averageFixedHitsPerContest: result.summary.averageFixedHitsPerContest,
        maxHits: result.summary.maxHits,
        prizeGames: result.summary.prizeGames,
        prizeRate: result.summary.prizeRate,
        testedContests: result.summary.testedContests,
        totalGames: result.summary.totalGames,
      };
    })
    .sort(
      (a, b) =>
        b.prizeRate - a.prizeRate ||
        b.averageHitsPerGame - a.averageHitsPerGame ||
        b.maxHits - a.maxHits ||
        a.name.localeCompare(b.name),
    );
}
