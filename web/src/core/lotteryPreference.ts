import { isLotteryId, type LotteryId } from "./mainContext.js";

export const LOTTERY_PREFERENCE_KEY = "loto-lab:lottery";

export function readLotteryPreference(): LotteryId | undefined {
  const saved = localStorage.getItem(LOTTERY_PREFERENCE_KEY);
  if (!saved) return undefined;
  if (isLotteryId(saved)) return saved;
  localStorage.removeItem(LOTTERY_PREFERENCE_KEY);
  return undefined;
}

export function writeLotteryPreference(lottery: LotteryId): void {
  localStorage.setItem(LOTTERY_PREFERENCE_KEY, lottery);
}
