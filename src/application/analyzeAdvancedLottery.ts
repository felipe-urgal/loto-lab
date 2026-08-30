import { createHash } from "node:crypto";
import type { AdvancedAnalysis } from "../analysis/advancedTypes.js";
import type { Contest, LotteryId } from "../domain/types.js";

export interface AdvancedAnalysisResponse {
  lottery: LotteryId;
  advanced: AdvancedAnalysis;
}

export interface AdvancedAnalysisHistoryReader {
  listAnalysisHistory(lottery: LotteryId): Promise<Contest[]>;
}

export type AdvancedAnalysisExecutor = (
  contests: Contest[],
  lottery: LotteryId,
) => Promise<AdvancedAnalysis>;

interface AdvancedAnalysisCacheEntry {
  signature: string;
  value: AdvancedAnalysis;
}

interface AdvancedAnalysisInFlightEntry {
  signature: string;
  promise: Promise<AdvancedAnalysis>;
}

function analysisSignature(contests: Contest[]): string {
  const hash = createHash("sha256");
  for (const contest of contests) {
    hash.update(String(contest.number));
    hash.update("|");
    hash.update(contest.date);
    hash.update("|");
    hash.update([...contest.numbers].sort((a, b) => a - b).join(","));
    hash.update(";");
  }
  return hash.digest("hex");
}

export class AnalyzeAdvancedLotteryUseCase {
  private readonly cache = new Map<LotteryId, AdvancedAnalysisCacheEntry>();
  private readonly inFlight = new Map<LotteryId, AdvancedAnalysisInFlightEntry>();

  constructor(
    private readonly history: AdvancedAnalysisHistoryReader,
    private readonly executeAnalysis: AdvancedAnalysisExecutor,
  ) {}

  async execute(lottery: LotteryId): Promise<AdvancedAnalysisResponse> {
    const contests = await this.history.listAnalysisHistory(lottery);
    const signature = analysisSignature(contests);
    const cached = this.cache.get(lottery);
    if (cached?.signature === signature) {
      return { lottery, advanced: cached.value };
    }

    const existing = this.inFlight.get(lottery);
    if (existing?.signature === signature) {
      return { lottery, advanced: await existing.promise };
    }

    const promise = this.executeAnalysis(contests, lottery);
    this.inFlight.set(lottery, { signature, promise });
    try {
      const advanced = await promise;
      this.cache.set(lottery, { signature, value: advanced });
      return { lottery, advanced };
    } finally {
      const current = this.inFlight.get(lottery);
      if (current?.promise === promise) this.inFlight.delete(lottery);
    }
  }
}
