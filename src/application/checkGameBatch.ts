import { evaluateGames, type GameCheckResult } from "../checker/evaluate.js";
import type { Contest, GeneratedGame, LotteryId } from "../domain/types.js";

export interface CheckableGameBatch {
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

export interface GeneratedBatchReader {
  findBatch(id: number): Promise<CheckableGameBatch | undefined>;
}

export interface ContestReader {
  findByNumber(lottery: LotteryId, contestNumber: number): Promise<Contest | undefined>;
}

export type CheckGameBatchResult =
  | undefined
  | {
      batch: CheckableGameBatch;
      target: Contest | undefined;
      checks: GameCheckResult[] | undefined;
    };

export class CheckGameBatchUseCase {
  constructor(
    private readonly batches: GeneratedBatchReader,
    private readonly contests: ContestReader,
  ) {}

  async execute(batchId: number, contestNumber: number): Promise<CheckGameBatchResult> {
    const batch = await this.batches.findBatch(batchId);
    if (!batch) return undefined;

    const target = await this.contests.findByNumber(batch.lottery, contestNumber);
    if (!target) return { batch, target: undefined, checks: undefined };

    return {
      batch,
      target,
      checks: evaluateGames(batch.games, target),
    };
  }
}
