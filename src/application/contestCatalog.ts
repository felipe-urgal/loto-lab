import type { Contest, LotteryId } from "../domain/types.js";

export interface ContestListQuery {
  lottery: LotteryId;
  startContest?: number;
  endContest?: number;
  limit?: number;
  order?: "asc" | "desc";
}

export interface ContestCatalogReader {
  findByNumber(lottery: LotteryId, contestNumber: number): Promise<Contest | undefined>;
  list(options: ContestListQuery): Promise<Contest[]>;
}

export class ContestCatalogUseCase {
  constructor(private readonly contests: ContestCatalogReader) {}

  async latest(lottery: LotteryId): Promise<Contest | undefined> {
    const contests = await this.contests.list({ lottery, order: "desc", limit: 1 });
    return contests[0];
  }

  async findByNumber(lottery: LotteryId, contestNumber: number): Promise<Contest | undefined> {
    return this.contests.findByNumber(lottery, contestNumber);
  }

  async list(query: ContestListQuery): Promise<Contest[]> {
    return this.contests.list(query);
  }
}
