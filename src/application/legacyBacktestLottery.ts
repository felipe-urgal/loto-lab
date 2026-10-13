import type { LotteryId } from "../domain/types.js";

export const LEGACY_BACKTEST_LOTTERIES = ["mega-sena", "lotofacil", "dia-de-sorte"] as const;
export type LegacyBacktestLottery = (typeof LEGACY_BACKTEST_LOTTERIES)[number];

export class UnsupportedBacktestLotteryError extends Error {
  readonly code = "UNSUPPORTED_BACKTEST_LOTTERY";
  constructor(readonly lottery: string) {
    super(`Legacy backtest is not available for ${lottery}; use Generator V2 or modality-compatible analysis`);
    this.name = "UnsupportedBacktestLotteryError";
  }
}

export function assertLegacyBacktestLottery(lottery: LotteryId): asserts lottery is LegacyBacktestLottery {
  if (!(LEGACY_BACKTEST_LOTTERIES as readonly string[]).includes(lottery)) {
    throw new UnsupportedBacktestLotteryError(lottery);
  }
}

export function assertNeverBacktestLottery(lottery: never): never {
  throw new UnsupportedBacktestLotteryError(String(lottery));
}
