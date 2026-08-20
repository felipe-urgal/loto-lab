import type { Contest, LotteryId } from "../domain/types.js";
import { backtestMegaSena } from "../backtest/megaSena.js";
import { backtestLotofacil } from "../backtest/lotofacil.js";
import { backtestDiaDeSorte } from "../backtest/diaDeSorte.js";
import {
  summarizeBacktestRounds,
  type BacktestSummary,
  type SummarizableRound,
} from "../backtest/shared.js";

export interface StrategyLabOptions {
  lottery: LotteryId;
  gameCount?: number;
  warmupContests?: number;
  startContest?: number;
  endContest?: number;
  lookbackContests?: number;
  bucketSize?: number;
}

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
  summary: BacktestSummary & Record<string, unknown>;
  series: StrategyLabPoint[];
}

export interface StrategyLabResult {
  lottery: LotteryId;
  startContest?: number;
  endContest?: number;
  gameCount: number;
  warmupContests: number;
  bucketSize: number;
  rankingBasis: "roi" | "prizeRate";
  winner?: string;
  variants: StrategyLabVariant[];
}

interface LabRound extends SummarizableRound {
  contest: number;
  date: string;
}

function integerInRange(value: number, name: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function seriesFor(rounds: LabRound[], bucketSize: number): StrategyLabPoint[] {
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

function resolvePeriod(
  contests: Contest[],
  options: StrategyLabOptions,
): { startContest?: number; endContest?: number } {
  const scoped = contests
    .filter((contest) => contest.lottery === options.lottery)
    .sort((a, b) => a.number - b.number);
  const latest = scoped.at(-1)?.number;
  if (latest === undefined) return {};

  const endContest = options.endContest ?? latest;
  if (options.startContest !== undefined) {
    return { startContest: options.startContest, endContest };
  }

  const lookback = integerInRange(options.lookbackContests ?? 200, "lookbackContests", 10, 5000);
  return {
    startContest: Math.max(1, endContest - lookback + 1),
    endContest,
  };
}

function toVariant(
  key: string,
  label: string,
  fixedCount: number,
  rounds: LabRound[],
  summary: BacktestSummary & Record<string, unknown>,
  bucketSize: number,
): StrategyLabVariant {
  return {
    key,
    label,
    fixedCount,
    summary,
    series: seriesFor(rounds, bucketSize),
  };
}

export function compareStrategyLab(
  contests: Contest[],
  options: StrategyLabOptions,
): StrategyLabResult {
  const gameCount = integerInRange(
    options.gameCount ?? (options.lottery === "mega-sena" ? 2 : 4),
    "gameCount",
    1,
    20,
  );
  const warmupContests = integerInRange(options.warmupContests ?? 20, "warmupContests", 1, 5000);
  const bucketSize = integerInRange(options.bucketSize ?? 25, "bucketSize", 5, 200);
  const period = resolvePeriod(contests, options);

  const common = {
    gameCount,
    warmupContests,
    ...(period.startContest !== undefined ? { startContest: period.startContest } : {}),
    ...(period.endContest !== undefined ? { endContest: period.endContest } : {}),
  };

  let variants: StrategyLabVariant[];

  if (options.lottery === "mega-sena") {
    variants = ([0, 2, 3] as const).map((fixedCount) => {
      const result = backtestMegaSena(contests, { ...common, fixedCount });
      return toVariant(
        `mega-${fixedCount}-fixas`,
        fixedCount === 0 ? "Sem núcleo fixo" : `${fixedCount} fixas`,
        fixedCount,
        result.rounds,
        result.summary,
        bucketSize,
      );
    });
  } else if (options.lottery === "lotofacil") {
    variants = ([8, 9, 10] as const).map((fixedCount) => {
      const result = backtestLotofacil(contests, { ...common, fixedCount });
      return toVariant(
        `lotofacil-${fixedCount}-fixas`,
        `${fixedCount} fixas`,
        fixedCount,
        result.rounds,
        result.summary,
        bucketSize,
      );
    });
  } else {
    variants = ([0, 2, 3] as const).map((fixedCount) => {
      const result = backtestDiaDeSorte(contests, { ...common, fixedCount });
      return toVariant(
        `dia-${fixedCount}-fixas`,
        fixedCount === 0 ? "Sem núcleo fixo" : `${fixedCount} fixas`,
        fixedCount,
        result.rounds,
        result.summary,
        bucketSize,
      );
    });
  }

  const hasReliableFinance = variants.every((variant) => variant.summary.financialCoverage >= 0.8);
  const rankingBasis = hasReliableFinance ? "roi" : "prizeRate";
  variants.sort((a, b) => {
    if (rankingBasis === "roi") {
      return (
        b.summary.roi - a.summary.roi ||
        b.summary.prizeRate - a.summary.prizeRate ||
        b.summary.averageHitsPerGame - a.summary.averageHitsPerGame ||
        a.fixedCount - b.fixedCount
      );
    }
    return (
      b.summary.prizeRate - a.summary.prizeRate ||
      b.summary.averageHitsPerGame - a.summary.averageHitsPerGame ||
      b.summary.maxHits - a.summary.maxHits ||
      a.fixedCount - b.fixedCount
    );
  });

  return {
    lottery: options.lottery,
    ...period,
    gameCount,
    warmupContests,
    bucketSize,
    rankingBasis,
    ...(variants[0] ? { winner: variants[0].key } : {}),
    variants,
  };
}
