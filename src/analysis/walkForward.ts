import type { AnalysisWeights, Contest, LotteryConfig } from "../domain/types.js";
import { DEFAULT_WEIGHTS } from "./scoring.js";
import { evaluateRankingQuality } from "./rankQuality.js";
import { pairedSignFlipNull, type NullDistributionSummary } from "./nullSimulation.js";

export interface WeightProfile {
  key: string;
  label: string;
  weights: AnalysisWeights;
}

export interface WalkForwardFold {
  trainEndContest: number;
  testStartContest: number;
  testEndContest: number;
  testRounds: number;
  selectedProfile: string;
  selectedLabel: string;
  trainAuc: number;
  tunedTestAuc: number;
  defaultTestAuc: number;
  deltaVsDefault: number;
}

export interface WalkForwardResult {
  folds: WalkForwardFold[];
  totalTestRounds: number;
  tunedAuc: number;
  defaultAuc: number;
  deltaVsDefault: number;
  trainingWindow: number;
  validationBlock: number;
  profiles: Array<{ key: string; label: string }>;
  nullBenchmark: NullDistributionSummary;
  methodology: {
    leakageProtection: true;
    parameterFreezeWithinFold: true;
    selectionMetric: "auc";
    nullModel: "paired-sign-flip";
  };
}

export const SCORE_V2_WEIGHT_PROFILES: WeightProfile[] = [
  { key: "default", label: "Padrão", weights: DEFAULT_WEIGHTS },
  {
    key: "long-horizon",
    label: "Longo prazo",
    weights: { historical: 0.3, year: 0.3, month: 0.1, recent20: 0.2, recent10: 0.1 },
  },
  {
    key: "recent-heavy",
    label: "Recência",
    weights: { historical: 0.1, year: 0.2, month: 0.2, recent20: 0.3, recent10: 0.2 },
  },
  {
    key: "balanced-windows",
    label: "Janelas equilibradas",
    weights: { historical: 0.2, year: 0.2, month: 0.2, recent20: 0.2, recent10: 0.2 },
  },
];

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function weightedMean(values: Array<{ value: number; weight: number }>, fallback = 0.5): number {
  const weight = values.reduce((sum, item) => sum + item.weight, 0);
  if (weight <= 0) return fallback;
  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / weight;
}

export function evaluateWalkForwardWeights(
  contests: Contest[],
  config: LotteryConfig,
  options: {
    warmupContests?: number;
    trainingWindow?: number;
    validationBlock?: number;
    profiles?: WeightProfile[];
    nullSamples?: number;
    startContest?: number;
    endContest?: number;
  } = {},
): WalkForwardResult {
  const warmupContests = Math.max(10, Math.round(options.warmupContests ?? 20));
  const trainingWindow = Math.max(25, Math.round(options.trainingWindow ?? 100));
  const validationBlock = Math.max(10, Math.round(options.validationBlock ?? 25));
  const profiles = options.profiles?.length ? options.profiles : SCORE_V2_WEIGHT_PROFILES;
  const scoped = contests
    .filter((contest) => contest.lottery === config.id)
    .sort((a, b) => a.number - b.number);
  const folds: WalkForwardFold[] = [];

  const minimumTestIndex = Math.min(scoped.length, warmupContests + trainingWindow);
  const requestedStartIndex = options.startContest === undefined
    ? minimumTestIndex
    : scoped.findIndex((contest) => contest.number >= options.startContest);
  let testStartIndex = Math.max(
    minimumTestIndex,
    requestedStartIndex < 0 ? scoped.length : requestedStartIndex,
  );
  const endExclusive = options.endContest === undefined
    ? scoped.length
    : (() => {
      const index = scoped.findIndex((contest) => contest.number > options.endContest!);
      return index < 0 ? scoped.length : index;
    })();

  while (testStartIndex < endExclusive) {
    const testEndIndex = Math.min(endExclusive, testStartIndex + validationBlock);
    const trainEnd = scoped[testStartIndex - 1];
    const testStart = scoped[testStartIndex];
    const testEnd = scoped[testEndIndex - 1];
    if (!trainEnd || !testStart || !testEnd) break;

    const trainSnapshot = scoped.slice(0, testStartIndex);
    const rankedProfiles = profiles.map((profile) => ({
      profile,
      quality: evaluateRankingQuality(trainSnapshot, config, {
        model: "score-v2",
        weights: profile.weights,
        warmupContests,
        maxRounds: trainingWindow,
      }),
    })).sort((a, b) =>
      b.quality.auc - a.quality.auc ||
      b.quality.meanDrawnPercentile - a.quality.meanDrawnPercentile ||
      a.profile.key.localeCompare(b.profile.key),
    );

    const selected = rankedProfiles[0];
    if (!selected) break;
    const evaluationSnapshot = scoped.slice(0, testEndIndex);
    const tuned = evaluateRankingQuality(evaluationSnapshot, config, {
      model: "score-v2",
      weights: selected.profile.weights,
      warmupContests,
      startContest: testStart.number,
      endContest: testEnd.number,
      maxRounds: 0,
    });
    const baseline = evaluateRankingQuality(evaluationSnapshot, config, {
      model: "score-v2",
      weights: DEFAULT_WEIGHTS,
      warmupContests,
      startContest: testStart.number,
      endContest: testEnd.number,
      maxRounds: 0,
    });
    const testRounds = Math.min(tuned.rounds, baseline.rounds);
    if (testRounds > 0) {
      folds.push({
        trainEndContest: trainEnd.number,
        testStartContest: testStart.number,
        testEndContest: testEnd.number,
        testRounds,
        selectedProfile: selected.profile.key,
        selectedLabel: selected.profile.label,
        trainAuc: selected.quality.auc,
        tunedTestAuc: tuned.auc,
        defaultTestAuc: baseline.auc,
        deltaVsDefault: round(tuned.auc - baseline.auc),
      });
    }
    testStartIndex = testEndIndex;
  }

  const totalTestRounds = folds.reduce((sum, fold) => sum + fold.testRounds, 0);
  const tunedAuc = weightedMean(folds.map((fold) => ({ value: fold.tunedTestAuc, weight: fold.testRounds })));
  const defaultAuc = weightedMean(folds.map((fold) => ({ value: fold.defaultTestAuc, weight: fold.testRounds })));
  const pairedDifferences = folds.map((fold) => fold.deltaVsDefault);
  const foldWeights = folds.map((fold) => fold.testRounds);
  const nullBenchmark = pairedSignFlipNull(
    pairedDifferences,
    options.nullSamples ?? 2000,
    `walk-forward:${config.id}:${folds.map((fold) => `${fold.testStartContest}-${fold.testEndContest}`).join("|")}`,
    foldWeights,
  );

  return {
    folds,
    totalTestRounds,
    tunedAuc: round(tunedAuc),
    defaultAuc: round(defaultAuc),
    deltaVsDefault: round(tunedAuc - defaultAuc),
    trainingWindow,
    validationBlock,
    profiles: profiles.map((profile) => ({ key: profile.key, label: profile.label })),
    nullBenchmark,
    methodology: {
      leakageProtection: true,
      parameterFreezeWithinFold: true,
      selectionMetric: "auc",
      nullModel: "paired-sign-flip",
    },
  };
}
