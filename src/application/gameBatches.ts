import type { LotteryId } from "../domain/types.js";
import type { ApplicationGameBatch } from "./gameBatch.js";

export type GameBatchScope = "active" | "archived" | "all";

export interface GameBatchCounts {
  active: number;
  archived: number;
  realBets: number;
}

export interface GameBatchStore {
  findBatch(id: number): Promise<ApplicationGameBatch | undefined>;
  listRecent(
    lottery: LotteryId,
    limit?: number,
    scope?: GameBatchScope,
  ): Promise<ApplicationGameBatch[]>;
  counts(lottery: LotteryId): Promise<GameBatchCounts>;
  setArchived(id: number, archived: boolean): Promise<ApplicationGameBatch | undefined>;
}

export class GameBatchUseCase {
  constructor(private readonly store: GameBatchStore) {}

  async find(id: number): Promise<ApplicationGameBatch | undefined> {
    return this.store.findBatch(id);
  }

  async listRecent(lottery: LotteryId, limit: number): Promise<ApplicationGameBatch[]> {
    return this.store.listRecent(lottery, limit, "active");
  }

  async manage(lottery: LotteryId, limit: number, scope: GameBatchScope) {
    const [items, counts] = await Promise.all([
      this.store.listRecent(lottery, limit, scope),
      this.store.counts(lottery),
    ]);
    return { items, counts, scope };
  }

  async setHidden(id: number, hidden: boolean): Promise<ApplicationGameBatch | undefined> {
    return this.store.setArchived(id, hidden);
  }
}
