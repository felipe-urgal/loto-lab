import type { AnalysisModel, Contest, LotteryId } from "../domain/types.js";
import { getLotteryConfig } from "../lotteries/config.js";
import { evaluateRankingQuality, type RankingQualityResult } from "../analysis/rankQuality.js";
import { evaluateWalkForwardWeights, type WalkForwardResult } from "../analysis/walkForward.js";
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
import {
  backtestRandomControl,
  sampleRandomControls,
  type RandomControlSample,
} from "./randomControl.js";

export type StrategyLabExperiment = "fixed-core" | "external-rules" | "score-model";
export type StrategyEvidenceStatus = "beats-random" | "inconclusive" | "no-evidence" | "underperforms-random";

export interface StrategyLabOptions {
  lottery: LotteryId;
  experiment?: StrategyLabExperiment;
  gameCount?: number;
  warmupContests?: number;
  startContest?: number;
  endContest?: number;
  lookbackContests?: number;
  bucketSize?: number;
  randomSamples?: number;
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
  rules?: MegaSenaGameRules;
  analysisModel?: AnalysisModel;
  summary: BacktestSummary;
  series: StrategyLabPoint[];
}

export interface StrategyLabBenchmarkDistribution {
  samples: number;
  p05: number;
  p50: number;
  p95: number;
}

export interface StrategyLabBenchmark {
  controlKey: string;
  bestStrategyKey?: string;
  basis: "roi" | "prizeRate";
  delta: number;
  beatsRandom: boolean;
  strategyPercentile: number;
  status: StrategyEvidenceStatus;
  distribution: StrategyLabBenchmarkDistribution;
  control: StrategyLabVariant;
}

export interface StrategyLabRankingQuality {
  model: AnalysisModel;
  label: string;
  quality: RankingQualityResult;
}

export interface StrategyLabResult {
  lottery: LotteryId;
  experiment: StrategyLabExperiment;
  startContest?: number;
  endContest?: number;
  gameCount: number;
  warmupContests: number;
  bucketSize: number;
  randomSamples: number;
  rankingBasis: "roi" | "prizeRate";
  winner?: string;
  benchmark: StrategyLabBenchmark;
  variants: StrategyLabVariant[];
  rankingQuality?: StrategyLabRankingQuality[];
  walkForward?: WalkForwardResult;
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
  { key: "mega-rules-baseline", label: "Score v2 · sem filtro externo", rules: {} },
  { key: "mega-rules-group-2", label: "Grupo das 26 · mínimo 2", rules: { minPreferredGroup: 2 } },
  { key: "mega-rules-group-3", label: "Grupo das 26 · mínimo 3", rules: { minPreferredGroup: 3 } },
  { key: "mega-rules-no-consecutive", label: "Sem dezenas consecutivas", rules: { avoidConsecutive: true } },
  { key: "mega-rules-columns", label: "Sem repetir coluna vertical", rules: { avoidSameColumn: true } },
  { key: "mega-rules-parity", label: "Paridade exata · 3/3", rules: { equalParity: true } },
  { key: "mega-rules-quadrants", label: "Todos os 4 quadrantes", rules: { minQuadrants: 4 } },
  { key: "mega-rules-article-2", label: "Artigo completo · grupo 2+", rules: ARTICLE_RULES_GROUP_2 },
  { key: "mega-rules-article-3", label: "Artigo completo · grupo 3+", rules: ARTICLE_RULES_GROUP_3 },
];

const SCORE_MODEL_VARIANTS: Array<{ key: string; label: string; model: AnalysisModel }> = [
  { key: "score-v2", label: "Score v2 · evidência ajustada", model: "score-v2" },
  { key: "score-v1", label: "Score v1 · min/max", model: "score-v1" },
  { key: "no-score", label: "Sem score · controle estrutural", model: "no-score" },
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
    series: seriesFor(rounds, bucketSize),
  };
}

function compareMegaExternalRules(
  contests: Contest[],
  common: { gameCount: number; warmupContests: number; startContest?: number; endContest?: number },
  bucketSize: number,
): StrategyLabVariant[] {
  return MEGA_EXTERNAL_VARIANTS.map((variant) => {
    const result = backtestMegaSena(contests, { ...common, fixedCount: 0, rules: variant.rules, analysisModel: "score-v2" });
    return toVariant(variant.key, variant.label, 0, result.rounds, result.summary, bucketSize, variant.rules, "score-v2");
  });
}

function compareScoreModels(
  contests: Contest[],
  lottery: LotteryId,
  common: { gameCount: number; warmupContests: number; startContest?: number; endContest?: number },
  bucketSize: number,
): StrategyLabVariant[] {
  return SCORE_MODEL_VARIANTS.map((variant) => {
    if (lottery === "mega-sena") {
      const result = backtestMegaSena(contests, { ...common, fixedCount: 3, analysisModel: variant.model });
      return toVariant(`mega-${variant.key}`, variant.label, 3, result.rounds, result.summary, bucketSize, undefined, variant.model);
    }
    if (lottery === "lotofacil") {
      const result = backtestLotofacil(contests, { ...common, fixedCount: 8, analysisModel: variant.model });
      return toVariant(`lotofacil-${variant.key}`, variant.label, 8, result.rounds, result.summary, bucketSize, undefined, variant.model);
    }
    const result = backtestDiaDeSorte(contests, { ...common, fixedCount: 3, analysisModel: variant.model });
    return toVariant(`dia-${variant.key}`, variant.label, 3, result.rounds, result.summary, bucketSize, undefined, variant.model);
  });
}

function metricValue(summary: BacktestSummary, basis: "roi" | "prizeRate"): number {
  return basis === "roi" ? summary.roi : summary.prizeRate;
}

function percentile(values: number[], probability: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  const fraction = position - lower;
  return sorted[lower]! * (1 - fraction) + sorted[upper]! * fraction;
}

function percentileRank(values: number[], value: number): number {
  if (values.length === 0) return 0.5;
  const belowOrEqual = values.filter((candidate) => candidate <= value).length;
  return belowOrEqual / values.length;
}

function evidenceStatus(percentileValue: number): StrategyEvidenceStatus {
  if (percentileValue >= 0.95) return "beats-random";
  if (percentileValue >= 0.9) return "inconclusive";
  if (percentileValue <= 0.05) return "underperforms-random";
  return "no-evidence";
}

function medianRandomControl(
  contests: Contest[],
  lottery: LotteryId,
  common: { gameCount: number; warmupContests: number; startContest?: number; endContest?: number },
  bucketSize: number,
  samples: RandomControlSample[],
  basis: "roi" | "prizeRate",
): StrategyLabVariant {
  const ordered = [...samples].sort((a, b) => metricValue(a.summary, basis) - metricValue(b.summary, basis));
  const medianSample = ordered[Math.floor((ordered.length - 1) / 2)]!;
  const result = backtestRandomControl(contests, { lottery, ...common, seed: medianSample.seed });
  return toVariant(
    "random-control",
    "Controle aleatório · mediana",
    0,
    result.rounds,
    result.summary,
    bucketSize,
  );
}

function rankingQualityForExperiment(
  contests: Contest[],
  lottery: LotteryId,
  period: { startContest?: number; endContest?: number },
  warmupContests: number,
): StrategyLabRankingQuality[] {
  const config = getLotteryConfig(lottery);
  return SCORE_MODEL_VARIANTS.map((variant) => ({
    model: variant.model,
    label: variant.label,
    quality: evaluateRankingQuality(contests, config, {
      model: variant.model,
      warmupContests,
      ...(period.startContest !== undefined ? { startContest: period.startContest } : {}),
      ...(period.endContest !== undefined ? { endContest: period.endContest } : {}),
      maxRounds: 500,
    }),
  }));
}

export function compareStrategyLab(contests: Contest[], options: StrategyLabOptions): StrategyLabResult {
  const experiment = options.experiment ?? "fixed-core";
  if (experiment === "external-rules" && options.lottery !== "mega-sena") {
    throw new Error("external-rules experiment is available only for Mega-Sena");
  }

  const gameCount = integerInRange(options.gameCount ?? (options.lottery === "mega-sena" ? 2 : 4), "gameCount", 1, 20);
  const warmupContests = integerInRange(options.warmupContests ?? 20, "warmupContests", 1, 5000);
  const bucketSize = integerInRange(options.bucketSize ?? 25, "bucketSize", 5, 200);
  const randomSamples = integerInRange(options.randomSamples ?? 100, "randomSamples", 10, 500);
  const period = resolvePeriod(contests, options);
  const common = {
    gameCount,
    warmupContests,
    ...(period.startContest !== undefined ? { startContest: period.startContest } : {}),
    ...(period.endContest !== undefined ? { endContest: period.endContest } : {}),
  };

  let variants: StrategyLabVariant[];
  if (experiment === "score-model") {
    variants = compareScoreModels(contests, options.lottery, common, bucketSize);
  } else if (options.lottery === "mega-sena" && experiment === "external-rules") {
    variants = compareMegaExternalRules(contests, common, bucketSize);
  } else if (options.lottery === "mega-sena") {
    variants = ([0, 2, 3] as const).map((fixedCount) => {
      const result = backtestMegaSena(contests, { ...common, fixedCount, analysisModel: "score-v2" });
      return toVariant(`mega-${fixedCount}-fixas`, fixedCount === 0 ? "Sem núcleo fixo" : `${fixedCount} fixas`, fixedCount, result.rounds, result.summary, bucketSize, undefined, "score-v2");
    });
  } else if (options.lottery === "lotofacil") {
    variants = ([8, 9, 10] as const).map((fixedCount) => {
      const result = backtestLotofacil(contests, { ...common, fixedCount, analysisModel: "score-v2" });
      return toVariant(`lotofacil-${fixedCount}-fixas`, `${fixedCount} fixas`, fixedCount, result.rounds, result.summary, bucketSize, undefined, "score-v2");
    });
  } else {
    variants = ([0, 2, 3] as const).map((fixedCount) => {
      const result = backtestDiaDeSorte(contests, { ...common, fixedCount, analysisModel: "score-v2" });
      return toVariant(`dia-${fixedCount}-fixas`, fixedCount === 0 ? "Sem núcleo fixo" : `${fixedCount} fixas`, fixedCount, result.rounds, result.summary, bucketSize, undefined, "score-v2");
    });
  }

  const randomDistribution = sampleRandomControls(contests, { lottery: options.lottery, ...common }, randomSamples);
  const firstRandom = randomDistribution[0];
  const hasReliableFinance = variants.every((variant) => variant.summary.financialCoverage >= 0.8)
    && Boolean(firstRandom && firstRandom.summary.financialCoverage >= 0.8);
  const rankingBasis = hasReliableFinance ? "roi" : "prizeRate";

  variants.sort((a, b) => {
    if (rankingBasis === "roi") {
      return b.summary.roi - a.summary.roi || b.summary.prizeRate - a.summary.prizeRate || b.summary.averageHitsPerGame - a.summary.averageHitsPerGame || a.fixedCount - b.fixedCount;
    }
    return b.summary.prizeRate - a.summary.prizeRate || b.summary.averageHitsPerGame - a.summary.averageHitsPerGame || b.summary.maxHits - a.summary.maxHits || a.fixedCount - b.fixedCount;
  });

  const control = medianRandomControl(contests, options.lottery, common, bucketSize, randomDistribution, rankingBasis);
  const bestStrategy = variants[0];
  const randomValues = randomDistribution.map((sample) => metricValue(sample.summary, rankingBasis));
  const strategyValue = bestStrategy ? metricValue(bestStrategy.summary, rankingBasis) : percentile(randomValues, 0.5);
  const p05 = percentile(randomValues, 0.05);
  const p50 = percentile(randomValues, 0.5);
  const p95 = percentile(randomValues, 0.95);
  const strategyPercentile = percentileRank(randomValues, strategyValue);
  const status = evidenceStatus(strategyPercentile);
  const delta = strategyValue - p50;
  const rankingQuality = experiment === "score-model"
    ? rankingQualityForExperiment(contests, options.lottery, period, warmupContests)
    : undefined;
  const walkForward = experiment === "score-model"
    ? evaluateWalkForwardWeights(contests, getLotteryConfig(options.lottery), {
      warmupContests,
      trainingWindow: Math.max(50, Math.min(200, options.lookbackContests ?? 200)),
      validationBlock: bucketSize,
      nullSamples: 2000,
    })
    : undefined;

  return {
    lottery: options.lottery,
    experiment,
    ...period,
    gameCount,
    warmupContests,
    bucketSize,
    randomSamples,
    rankingBasis,
    ...(bestStrategy ? { winner: bestStrategy.key } : {}),
    benchmark: {
      controlKey: control.key,
      ...(bestStrategy ? { bestStrategyKey: bestStrategy.key } : {}),
      basis: rankingBasis,
      delta,
      beatsRandom: status === "beats-random",
      strategyPercentile,
      status,
      distribution: { samples: randomSamples, p05, p50, p95 },
      control,
    },
    variants,
    ...(rankingQuality ? { rankingQuality } : {}),
    ...(walkForward ? { walkForward } : {}),
  };
}
