export type LotteryId = "mega-sena" | "lotofacil" | "dia-de-sorte";

export interface LotteryConfig {
  id: LotteryId;
  name: string;
  minNumber: number;
  maxNumber: number;
  drawSize: number;
}

export interface Contest {
  lottery: LotteryId;
  number: number;
  date: string;
  numbers: number[];
  luckyMonth?: string;
}

export type NumberTier = "strong" | "balanced" | "cold";

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
  metadata: {
    odd: number;
    even: number;
    sum: number;
    repeatedFromLastContest: number[];
  };
}

export interface AnalysisWeights {
  year: number;
  recent20: number;
  month: number;
  historical: number;
  recent10: number;
}
