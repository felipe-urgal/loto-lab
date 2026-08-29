import { buildNumberAnalysis, DEFAULT_WEIGHTS } from "../analysis/scoring.js";
import type {
  AnalysisWeights,
  Contest,
  LotteryId,
  NumberAnalysis,
  NumberTier,
} from "../domain/types.js";
import { getLotteryConfig } from "../lotteries/config.js";

export interface AnalysisHistoryReader {
  listAnalysisHistory(lottery: LotteryId): Promise<Contest[]>;
}

export interface AnalysisResponse {
  lottery: LotteryId;
  latestContest: Contest | null;
  weights: AnalysisWeights;
  tiers: Record<NumberTier, number[]>;
  numbers: NumberAnalysis[];
}

export class AnalyzeLotteryUseCase {
  constructor(private readonly history: AnalysisHistoryReader) {}

  async execute(lottery: LotteryId): Promise<AnalysisResponse> {
    const contests = await this.history.listAnalysisHistory(lottery);
    const config = getLotteryConfig(lottery);
    const rows = buildNumberAnalysis(contests, config);
    const latestContest = contests.at(-1) ?? null;

    return {
      lottery,
      latestContest,
      weights: DEFAULT_WEIGHTS,
      tiers: {
        strong: rows.filter((row) => row.tier === "strong").map((row) => row.number),
        balanced: rows.filter((row) => row.tier === "balanced").map((row) => row.number),
        cold: rows.filter((row) => row.tier === "cold").map((row) => row.number),
      },
      numbers: rows,
    };
  }
}
