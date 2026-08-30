import type { GeneratedGame, LotteryId } from "../domain/types.js";

export interface ApplicationGameBatch {
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

export interface SaveApplicationGameBatchInput {
  lottery: LotteryId;
  strategyId?: number;
  strategyVersionId?: number;
  targetContestNumber?: number;
  generatorOptions?: Record<string, unknown>;
  games: GeneratedGame[];
}
