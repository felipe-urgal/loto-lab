export type LotteryId = "mega-sena" | "lotofacil" | "dia-de-sorte";
export type MyGamesFilter = "visible" | "bets" | "generated" | "hidden";

export type Game = {
  numbers: number[];
  fixedNumbers?: number[];
  luckyMonth?: string;
};

export type GameBatch = {
  id: number;
  targetContestNumber?: number;
  createdAt: string;
  archivedAt?: string;
  games: Game[];
};

export type CheckResult = {
  hits: number;
  matchedNumbers?: number[];
  luckyMonthHit?: boolean;
};

export type RealBetGame = {
  batchPosition: number;
  game: Game;
  checkResult?: CheckResult | null;
  prizeValue?: number | null;
};

export type RealBet = {
  id: number;
  batchId: number;
  contestNumber: number;
  actualCost?: number | null;
  status: string;
  games?: RealBetGame[];
  totalPrizeValue?: number | null;
  netResult?: number | null;
};

export type GameBatchResponse = { items?: GameBatch[] };
export type RealBetResponse = { items?: RealBet[] };

export type ComparisonGame = {
  position: number;
  hits: number;
  matchedNumbers?: number[];
  luckyMonthHit?: boolean;
};

export type ComparisonItem = {
  contestNumber: number;
  date?: string;
  numbers: number[];
  matchedAnyNumbers?: number[];
  luckyMonth?: string;
  bestHits: number;
  games: ComparisonGame[];
};

export type ComparisonResponse = {
  startContestNumber: number;
  scope?: { note?: string };
  summary?: {
    contestCount?: number;
    bestHits?: number;
    bestContestNumber?: number;
    averageBestHits?: number | null;
  };
  items?: ComparisonItem[];
};
