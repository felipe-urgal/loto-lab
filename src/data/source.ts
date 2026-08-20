import type { Contest, LotteryId } from "../domain/types.js";

export interface ContestSource {
  fetchContest(lottery: LotteryId, contestNumber?: number): Promise<Contest>;
  fetchContestRange(
    lottery: LotteryId,
    startContest: number,
    endContest: number,
  ): Promise<Contest[]>;
}
