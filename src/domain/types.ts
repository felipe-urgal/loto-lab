import type { SecondarySelection, SupportedLotteryId } from "./lotteryCatalog.js";

export type LotteryId = SupportedLotteryId;

export interface LotteryConfig {
  id: LotteryId;
  name: string;
  minNumber: number;
  maxNumber: number;
  drawSize: number;
  defaultBetSize: number;
}

export interface ContestPrizeTier {
  description: string;
  winners: number;
  prizeValue: number;
  draw?: 1 | 2;
}

export interface Contest {
  lottery: LotteryId;
  number: number;
  date: string;
  numbers: number[];
  secondDrawNumbers?: number[];
  /** @deprecated Compatibility field; use secondary for new code. */
  luckyMonth?: string;
  secondary?: SecondarySelection;
  columns?: number[];
  prizeTiers?: ContestPrizeTier[];
  amountCollected?: number;
}

export type NumberTier = "strong" | "balanced" | "cold";
export type AnalysisModel = "score-v1" | "score-v2" | "no-score";

export interface NumberAnalysis {
  number: number;
  historical: number;
  year: number;
  month: number;
  recent10: number;
  recent20: number;
  score: number;
  tier: NumberTier;
}

export interface GeneratedGame {
  lottery: LotteryId;
  numbers: number[];
  fixedNumbers: number[];
  variableNumbers: number[];
  mirrorNumbers?: number[];
  /** @deprecated Compatibility field; use secondary for new code. */
  luckyMonth?: string;
  secondary?: SecondarySelection;
  columns?: number[][];
  metadata: {
    odd: number;
    even: number;
    sum: number;
    repeatedFromLastContest: number[];
    lineDistribution?: number[];
    columnDistribution?: number[];
  };
}

export interface AnalysisWeights {
  year: number;
  recent20: number;
  month: number;
  historical: number;
  recent10: number;
}
