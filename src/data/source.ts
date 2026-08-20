import type { Contest, LotteryId } from "../domain/types.js";

export interface ContestSource {
  fetchContest(lottery: LotteryId, contestNumber?: number): Promise<Contest>;
  fetchContestRange(
    lottery: LotteryId,
    startContest: number,
    endContest: number,
  ): Promise<Contest[]>;
}

export interface LotteryAgendaSnapshot {
  lottery: LotteryId;
  currentContest: number;
  nextContest: number;
  nextDrawDate?: string;
  estimatedPrize?: number;
  accumulated: boolean;
}

export interface LotteryAgendaSource {
  fetchAgenda(lottery: LotteryId): Promise<LotteryAgendaSnapshot>;
}

export function isLotteryAgendaSource(source: ContestSource): source is ContestSource & LotteryAgendaSource {
  return typeof (source as Partial<LotteryAgendaSource>).fetchAgenda === "function";
}
