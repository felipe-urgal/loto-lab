import type { Contest, LotteryId } from "../domain/types.js";
import { backtestMegaSena } from "../backtest/megaSena.js";
import { backtestLotofacil } from "../backtest/lotofacil.js";
import { backtestDiaDeSorte } from "../backtest/diaDeSorte.js";
import {
  ARTICLE_RULES_GROUP_2,
  ARTICLE_RULES_GROUP_3,
  type MegaSenaGameRules,
} from "../generator/megaSenaRules.js";
import {
  summarizeBacktestRounds,
  type BacktestSummary,
  type SummarizableRound,
} from "../backtest/shared.js";
import { backtestRandomControl } from "./randomControl.js";

export type StrategyLabExperiment = "fixed-core" | "external-rules";

export interface StrategyLabOptions {
  lottery: LotteryId;
  experiment?: StrategyLabExperiment;
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
  isControl: boolean;
  rules?: MegaSenaGameRules;
  summary: BacktestSummary;
  series: StrategyLabPoint[];
}

export interface StrategyLabBenchmark {
  controlKey: string;
  bestStrategyKey?: string;
  basis: "roi" | "prizeRate";
  delta: number;
  beatsRandom: boolean;
}

export interface StrategyLabResult {
  lottery: LotteryId;
  experiment: StrategyLabExperiment;
  startContest?: number;
  endContest?: number;
  gameCount: number;
  warmupContests: number;
  bucketSize: number;
  rankingBasis: "roi" | "prizeRate";
  winner?: string;
  benchmark: StrategyLabBenchmark;
  variants: StrategyLabVariant[];
}

interface LabRound extends SummarizableRound {
  contest: number;
  date: string;
}

interface MegaExternalVariant {
  key: string;
  label: string;
  rules: MegaSenaGameRules;
}

const MEGA_EXTERNAL_VARIANTS: MegaExternalVariant[] = [
  { key: "mega-rules-baseline", label: "Score atual · sem filtro externo", rules: {} },
  { key: "mega-rules-group-2", label: "Grupo das 26 · mínimo 2", rules: { minPreferredGroup: 2 } },
  { key: "mega-rules-group-3", label: "Grupo das 26 · mínimo 3", rules: { minPreferredGroup: 3 } },
  { key: "mega-rules-no-consecutive", label: "Sem dezenas consecutivas", rules: { avoidConsecutive: true } },
  { key: "mega-rules-columns", label: "Sem repetir coluna vertical", rules: { avoidSameColumn: true } },
  { key: "mega-rules-parity", label: "Paridade exata · 3/3", rules: { equalParity: true } },
  { key: "mega-rules-quadrants", label: "Todos os 4 quadrantes", rules: { minQuadrants: 4 } },
  { key: "mega-rules-article-2", label: "Artigo completo · grupo 2+", rules: ARTICLE_RULES_GROUP_2 },
  { key: "mega-rules-article-3", label: "Artigo completo · grupo 3+", rules: ARTICLE_RULES_GROUP_3 },
];

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

function resolvePeriod(contests: Contest[], options: StrategyLabOptions): { startContest?: number; endContest?: number } {
  const scoped = contests.filter((contest) => contest.lottery === options.lottery).sort((a, b) => a.number - b.number);
  const latest = scoped.at(-1)?.number;
  if (latest === undefined) return {};

  const endContest = options.endContest ?? latest;
  if (options.startContest !== undefined) return { startContest: options.startContest, endContest };

  const lookback = integerInRange(options.lookbackContests ?? 200, "lookbackContests", 10, 5000);
  return { startContest: Math.max(1, endContest - lookback + 1), endContest };
}

function toVariant(
  key: string,
  label: string,
  fixedCount: number,
  rounds: LabRound[],
  summary: BacktestSummary,
  bucketSize: number,
  metadata: { rules?: MegaSenaGameRules; isControl?: boolean } = {},
): StrategyLabVariant {
  return {
    key,
    label,
    fixedCount,
    isControl: metadata.isControl ?? false,
    ...(metadata.rules ? { rules: metadata.rules } : {}),
    summary,
    series: seriesFor(rounds, bucketSize),
  };
}

function compareMegaExternalRules(
  contests: Contest[],
  common: { gameCount: number; warmupContests: number; startContest?: number; endContest?: number },
  bucketSize: number,
): StrategyLabVariant[] {
  return MEGA_EXTERNAL_VARIANTS.map((variant) => {
    const result = backtestMegaSena(contests, { ...common, fixedCount: 0, rules: variant.rules });
    return toVariant(variant.key, variant.label, 0, result.rounds, result.summary, bucketSize, { rules: variant.rules });
  });
}

function tieBreakFixedCount(variant: StrategyLabVariant): number {
  return variant.isControl ? Number.MAX_SAFE_INTEGER : variant.fixedCount;
}

export function compareStrategyLab(contests: Contest[], options: StrategyLabOptions): StrategyLabResult {
  const experiment = options.experiment ?? "fixed-core";
  if (experiment === "external-rules" && options.lottery !== "mega-sena") {
    throw new Error("external-rules experiment is available only for Mega-Sena");
  }

  const gameCount = integerInRange(options.gameCount ?? (options.lottery === "mega-sena" ? 2 : 4), "gameCount", 1, 20);
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
  if (options.lottery === "mega-sena" && experiment === "external-rules") {
    variants = compareMegaExternalRules(contests, common, bucketSize);
  } else if (options.lottery === "mega-sena") {
    variants = ([0, 2, 3] as const).map((fixedCount) => {
      const result = backtestMegaSena(contests, { ...common, fixedCount });
      return toVariant(`mega-${fixedCount}-fixas`, fixedCount === 0 ? "Sem núcleo fixo" : `${fixedCount} fixas`, fixedCount, result.rounds, result.summary, bucketSize);
    });
  } else if (options.lottery === "lotofacil") {
    variants = ([8, 9, 10] as const).map((fixedCount) => {
      const result = backtestLotofacil(contests, { ...common, fixedCount });
      return toVariant(`lotofacil-${fixedCount}-fixas`, `${fixedCount} fixas`, fixedCount, result.rounds, result.summary, bucketSize);
    });
  } else {
    variants = ([0, 2, 3] as const).map((fixedCount) => {
      const result = backtestDiaDeSorte(contests, { ...common, fixedCount });
      return toVariant(`dia-${fixedCount}-fixas`, fixedCount === 0 ? "Sem núcleo fixo" : `${fixedCount} fixas`, fixedCount, result.rounds, result.summary, bucketSize);
    });
  }

  const randomControl = backtestRandomControl(contests, { lottery: options.lottery, ...common });
  variants.push(toVariant("random-control", "Controle aleatório", 0, randomControl.rounds, randomControl.summary, bucketSize, { isControl: true }));

  const hasReliableFinance = variants.every((variant) => variant.summary.financialCoverage >= 0.8);
  const rankingBasis = hasReliableFinance ? "roi" : "prizeRate";
  variants.sort((a, b) => {
    if (rankingBasis === "roi") {
      return b.summary.roi - a.summary.roi || b.summary.prizeRate - a.summary.prizeRate || b.summary.averageHitsPerGame - a.summary.averageHitsPerGame || tieBreakFixedCount(a) - tieBreakFixedCount(b);
    }
    return b.summary.prizeRate - a.summary.prizeRate || b.summary.averageHitsPerGame - a.summary.averageHitsPerGame || b.summary.maxHits - a.summary.maxHits || tieBreakFixedCount(a) - tieBreakFixedCount(b);
  });

  const control = variants.find((variant) => variant.isControl)!;
  const bestStrategy = variants.find((variant) => !variant.isControl);
  const controlValue = rankingBasis === "roi" ? control.summary.roi : control.summary.prizeRate;
  const strategyValue = bestStrategy ? (rankingBasis === "roi" ? bestStrategy.summary.roi : bestStrategy.summary.prizeRate) : controlValue;
  const delta = strategyValue - controlValue;

  return {
    lottery: options.lottery,
    experiment,
    ...period,
    gameCount,
    warmupContests,
    bucketSize,
    rankingBasis,
    ...(variants[0] ? { winner: variants[0].key } : {}),
    benchmark: {
      controlKey: control.key,
      ...(bestStrategy ? { bestStrategyKey: bestStrategy.key } : {}),
      basis: rankingBasis,
      delta,
      beatsRandom: delta > 0,
    },
    variants,
  };
}
