import type { LotteryId } from "../domain/types.js";

export interface ApplicationBacktestRun {
  id: number;
  lottery: LotteryId;
  strategyId?: number;
  strategyVersionId?: number;
  options?: Record<string, unknown>;
  summary: Record<string, unknown>;
  rounds: Array<{ contest: number; [key: string]: unknown }>;
  createdAt: string;
}

export interface ApplicationBacktestSummary {
  id: number;
  lottery: LotteryId;
  strategyId?: number;
  strategyVersionId?: number;
  options: Record<string, unknown>;
  summary: Record<string, unknown>;
  roundCount: number;
  createdAt: string;
}

export interface BacktestCatalogStore {
  findById(id: number): Promise<ApplicationBacktestRun | undefined>;
  listRecentSummaries(lottery: LotteryId, limit?: number): Promise<ApplicationBacktestSummary[]>;
}

export class BacktestCatalogUseCase {
  constructor(private readonly store: BacktestCatalogStore) {}

  get(id: number): Promise<ApplicationBacktestRun | undefined> {
    return this.store.findById(id);
  }

  list(lottery: LotteryId, limit: number): Promise<ApplicationBacktestSummary[]> {
    return this.store.listRecentSummaries(lottery, limit);
  }
}
