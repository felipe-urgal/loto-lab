export const LOTTERIES = {
  "mega-sena": "Mega-Sena",
  lotofacil: "Lotofácil",
  "dia-de-sorte": "Dia de Sorte",
  quina: "Quina",
  lotomania: "Lotomania",
  "dupla-sena": "Dupla Sena",
  "mais-milionaria": "+Milionária",
  timemania: "Timemania",
  "super-sete": "Super Sete",
} as const;

export type LotteryId = keyof typeof LOTTERIES;

export type LotteryCapabilitiesDto = {
  analysis?: boolean;
  checking?: boolean;
  simulation?: boolean;
};

export type LotteryCatalogItemDto = {
  id?: string;
  name?: string;
  enabled?: boolean;
  family?: string;
  capabilities?: LotteryCapabilitiesDto;
};

export type LotteryCatalogPayload = {
  items?: LotteryCatalogItemDto[];
};

export type ContestDto = {
  number?: unknown;
  date?: string | null;
  numbers?: number[];
};

export type ContestsPayload = {
  items?: ContestDto[];
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

export type RealBetDto = {
  id?: unknown;
  batchId?: unknown;
  contestNumber?: unknown;
  status?: string;
  netResult?: unknown;
  totalPrizeValue?: unknown;
};

export type RealBetsPayload = {
  items?: RealBetDto[];
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
  catalog: LotteryCatalogPayload;
  contests: ContestsPayload;
  realBets: RealBetsPayload;
  batches: GameBatchesPayload;
};
