import type { LotteryId } from "../domain/types.js";
import { LOTTERY_CONFIGS } from "../lotteries/config.js";

const LOTTERIES = Object.keys(LOTTERY_CONFIGS) as LotteryId[];

export interface DataStatusReader {
  getDataStatus(lottery: LotteryId): Promise<unknown>;
}

export class GetDataStatusUseCase {
  constructor(private readonly reader: DataStatusReader) {}

  async execute(): Promise<{ items: unknown[] }> {
    return {
      items: await Promise.all(LOTTERIES.map((lottery) => this.reader.getDataStatus(lottery))),
    };
  }
}
