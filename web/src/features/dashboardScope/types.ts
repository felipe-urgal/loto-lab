export const LOTTERIES = {
  "mega-sena": "Mega-Sena",
  lotofacil: "Lotofácil",
  "dia-de-sorte": "Dia de Sorte",
} as const;

export type LotteryId = keyof typeof LOTTERIES;
export type DashboardScope = "all" | LotteryId;

export type ContestDto = {
  number?: unknown;
  date?: string | null;
  numbers?: number[];
};

export type BacktestSummaryDto = {
  roi?: unknown;
  financialCoverage?: unknown;
  bestHits?: unknown;
  totalPrizeValue?: unknown;
};

export type BacktestRunDto = {
  id?: unknown;
  summary?: BacktestSummaryDto;
};

export type BacktestsPayload = {
  items?: BacktestRunDto[];
};

export type RealBetSummaryDto = {
  checkedBets?: unknown;
  pendingBets?: unknown;
  checkedCost?: unknown;
  actualCost?: unknown;
  netResult?: unknown;
  totalPrizeValue?: unknown;
  roi?: unknown;
};

export type RealBetsPayload = {
  items?: unknown[];
  summary?: RealBetSummaryDto;
};

export type GameBatchDto = {
  id?: unknown;
  lottery?: string;
  targetContestNumber?: unknown;
  createdAt?: string | null;
  games?: unknown[];
};

export type GameBatchesPayload = {
  items?: GameBatchDto[];
};

export type FocusedDashboardData = {
  contest: ContestDto | null;
  backtests: BacktestsPayload;
  realBets: RealBetsPayload;
  batches: GameBatchesPayload;
};

export type DashboardEntry<T> = readonly [LotteryId, T];

export type AllDashboardData = {
  contests: DashboardEntry<ContestDto | null>[];
  backtests: DashboardEntry<BacktestsPayload>[];
  realBets: DashboardEntry<RealBetsPayload>[];
  batches: DashboardEntry<GameBatchesPayload>[];
};
