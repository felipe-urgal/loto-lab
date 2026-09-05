import type { AnalysisModel } from "../domain/types.js";
import type { MegaSenaGameRules } from "../generator/megaSenaRules.js";
import {
  summarizeBacktestRounds,
  type BacktestSummary,
  type SummarizableRound,
} from "../backtest/shared.js";

export interface StrategyLabPoint {
  startContest: number;
  endContest: number;
  startDate: string;
  endDate: string;
  testedContests: number;
  averageHitsPerGame: number;
  averageFixedHitsPerContest: number;
  prizeRate: number;
  roi: number;
  financialCoverage: number;
  netResult: number;
}

export interface StrategyLabVariant {
  key: string;
  label: string;
  fixedCount: number;
  rules?: MegaSenaGameRules;
  analysisModel?: AnalysisModel;
  summary: BacktestSummary;
  series: StrategyLabPoint[];
}

export interface StrategyLabRound extends SummarizableRound {
  contest: number;
  date: string;
}

export function buildStrategyLabSeries(
  rounds: StrategyLabRound[],
  bucketSize: number,
): StrategyLabPoint[] {
  const result: StrategyLabPoint[] = [];
  for (let index = 0; index < rounds.length; index += bucketSize) {
    const bucket = rounds.slice(index, index + bucketSize);
    const first = bucket[0];
    const last = bucket.at(-1);
    if (!first || !last) continue;
    const summary = summarizeBacktestRounds(bucket);
    result.push({
      startContest: first.contest,
      endContest: last.contest,
      startDate: first.date,
      endDate: last.date,
      testedContests: summary.testedContests,
      averageHitsPerGame: summary.averageHitsPerGame,
      averageFixedHitsPerContest: summary.averageFixedHitsPerContest,
      prizeRate: summary.prizeRate,
      roi: summary.roi,
      financialCoverage: summary.financialCoverage,
      netResult: summary.netResult,
    });
  }
  return result;
}

export function buildStrategyLabVariant(
  key: string,
  label: string,
  fixedCount: number,
  rounds: StrategyLabRound[],
  summary: BacktestSummary,
  bucketSize: number,
  rules?: MegaSenaGameRules,
  analysisModel?: AnalysisModel,
): StrategyLabVariant {
  return {
    key,
    label,
    fixedCount,
    ...(rules ? { rules } : {}),
    ...(analysisModel ? { analysisModel } : {}),
    summary,
    series: buildStrategyLabSeries(rounds, bucketSize),
  };
}
