import { createHash } from "node:crypto";
import type { Contest, LotteryId } from "../domain/types.js";

/** Versioned, order-independent fingerprint of the history available to a run.
 * Includes all prefix contests up to the final target, because rankings may
 * consume contests before the requested target period.
 */
export const BACKTEST_METHODOLOGY_VERSION = "legacy-backtest-v1";
export const STRATEGY_LAB_METHODOLOGY_VERSION = "strategy-lab-v2";
export const HISTORY_SIGNATURE_VERSION = "backtest-history-sha256-v1";

export function backtestHistorySignature(
  contests: Contest[],
  lottery: LotteryId,
  endContest?: number,
): string {
  const relevant = contests
    .filter((contest) => contest.lottery === lottery && (endContest === undefined || contest.number <= endContest))
    .sort((a, b) => a.number - b.number)
    .map((contest) => ({
      number: contest.number,
      date: contest.date,
      numbers: contest.numbers,
      secondDrawNumbers: contest.secondDrawNumbers ?? null,
      luckyMonth: contest.luckyMonth ?? null,
      secondary: contest.secondary ?? null,
      columns: contest.columns ?? null,
      prizeTiers: (contest.prizeTiers ?? []).map((tier) => ({
        description: tier.description,
        winners: tier.winners,
        prizeValue: tier.prizeValue,
        draw: tier.draw ?? 1,
      })),
      amountCollected: contest.amountCollected ?? null,
    }));
  const digest = createHash("sha256")
    .update(JSON.stringify([HISTORY_SIGNATURE_VERSION, lottery, relevant]))
    .digest("hex");
  return `${HISTORY_SIGNATURE_VERSION}:${digest}`;
}
