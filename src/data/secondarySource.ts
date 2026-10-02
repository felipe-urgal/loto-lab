import type { LotteryId } from "../domain/types.js";

export interface SecondaryContestSnapshot {
  lottery: LotteryId;
  contestNumber: number;
  drawDate: string;
  numbers: number[];
  source: {
    provider: string;
    repository?: string;
    ref?: string;
    url: string;
    fetchedAt: string;
  };
}

export interface SecondaryContestSource {
  supports(lottery: LotteryId): boolean;
  latestContestNumber(lottery: LotteryId): Promise<number>;
  fetchContest(lottery: LotteryId, contestNumber: number): Promise<SecondaryContestSnapshot | undefined>;
}
