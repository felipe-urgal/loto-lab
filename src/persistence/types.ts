import type { GeneratedGame, LotteryId } from "../domain/types.js";

export interface StrategyVersionRecord {
  id: number;
  strategyId: number;
  version: number;
  methodologyVersion: string;
  config: Record<string, unknown>;
  createdAt: string;
}

export interface StrategyRecord {
  id: number;
  slug: string;
  lottery: LotteryId;
  name: string;
  methodologyVersion: string;
  config: Record<string, unknown>;
  latestVersionId: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertStrategyInput {
  slug: string;
  lottery: LotteryId;
  name: string;
  methodologyVersion: string;
  config?: Record<string, unknown>;
}

export interface GeneratedGameBatchRecord {
  id: number;
  lottery: LotteryId;
  strategyId?: number;
  strategyVersionId?: number;
  targetContestNumber?: number;
  generatorOptions: Record<string, unknown>;
  createdAt: string;
  archivedAt?: string;
  hasRealBet: boolean;
  games: GeneratedGame[];
}

export interface SaveGeneratedGameBatchInput {
  lottery: LotteryId;
  strategyId?: number;
  strategyVersionId?: number;
  targetContestNumber?: number;
  generatorOptions?: Record<string, unknown>;
  games: GeneratedGame[];
}

export interface BacktestRoundArtifact {
  contest: number;
  [key: string]: unknown;
}

export interface SaveBacktestRunInput {
  lottery: LotteryId;
  strategyId?: number;
  strategyVersionId?: number;
  options?: Record<string, unknown>;
  summary: Record<string, unknown>;
  rounds: BacktestRoundArtifact[];
}

export interface BacktestRunRecord extends SaveBacktestRunInput {
  id: number;
  createdAt: string;
}

export interface BacktestRunSummaryRecord {
  id: number;
  lottery: LotteryId;
  strategyId?: number;
  strategyVersionId?: number;
  options: Record<string, unknown>;
  summary: Record<string, unknown>;
  roundCount: number;
  createdAt: string;
}
