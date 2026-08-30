import type { LotteryId } from "../domain/types.js";

const LOTTERIES: LotteryId[] = ["mega-sena", "lotofacil", "dia-de-sorte"];

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
