import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { Contest, LotteryId } from "../domain/types.js";
import type { buildAdvancedAnalysis } from "../analysis/advanced.js";
import { runAdvancedAnalysisInWorker } from "../analysis/advancedWorkerClient.js";
import { AnalyzeLotteryUseCase, type AnalysisResponse } from "../application/analyzeLottery.js";
import { CheckGameBatchUseCase, type CheckGameBatchResult } from "../application/checkGameBatch.js";
import {
  GenerateGamesUseCase,
  InsufficientGenerationHistoryError,
  MIN_GENERATION_HISTORY,
  type GenerateGamesRequest,
  type GenerateGamesResponse,
} from "../application/generateGames.js";
import {
  BacktestRoundLimitError,
  MAX_HTTP_BACKTEST_ROUNDS,
  RunBacktestUseCase,
  type RunBacktestRequest,
  type RunBacktestResponse,
} from "../application/runBacktest.js";
import { PostgresContestRepository } from "../persistence/contestRepository.js";
import { PostgresGameRepository } from "../persistence/gameRepository.js";
import { PostgresStrategyRepository } from "../persistence/strategyRepository.js";
import { PostgresBacktestRepository } from "../persistence/backtestRepository.js";
import type {
  BacktestRunSummaryRecord,
  StrategyRecord,
  UpsertStrategyInput,
} from "../persistence/types.js";

export {
  BacktestRoundLimitError,
  InsufficientGenerationHistoryError,
  MAX_HTTP_BACKTEST_ROUNDS,
  MIN_GENERATION_HISTORY,
};
export type {
  AnalysisResponse,
  GenerateGamesRequest,
  GenerateGamesResponse,
  RunBacktestRequest,
  RunBacktestResponse,
};

export type AdvancedAnalysis = ReturnType<typeof buildAdvancedAnalysis>;

export interface AdvancedAnalysisResponse {
  lottery: LotteryId;
  advanced: AdvancedAnalysis;
}

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

export class LotoLabApiServices {
  readonly contests: PostgresContestRepository;
  readonly games: PostgresGameRepository;
  readonly strategies: PostgresStrategyRepository;
  readonly backtests: PostgresBacktestRepository;
  private readonly analyzeLottery: AnalyzeLotteryUseCase;
  private readonly checkGameBatch: CheckGameBatchUseCase;
  private readonly generateGames: GenerateGamesUseCase;
  private readonly runBacktestUseCase: RunBacktestUseCase;
  private readonly advancedAnalysisCache = new Map<LotteryId, AdvancedAnalysisCacheEntry>();
  private readonly advancedAnalysisInFlight = new Map<LotteryId, AdvancedAnalysisInFlightEntry>();

  constructor(pool: Pool) {
    this.contests = new PostgresContestRepository(pool);
    this.games = new PostgresGameRepository(pool);
    this.strategies = new PostgresStrategyRepository(pool);
    this.backtests = new PostgresBacktestRepository(pool);
    this.analyzeLottery = new AnalyzeLotteryUseCase(this.contests);
    this.checkGameBatch = new CheckGameBatchUseCase(this.games, this.contests);
    this.generateGames = new GenerateGamesUseCase(this.contests, this.games);
    this.runBacktestUseCase = new RunBacktestUseCase(this.contests, this.backtests);
  }

  async analyze(lottery: LotteryId): Promise<AnalysisResponse> {
    return this.analyzeLottery.execute(lottery);
  }

  async analyzeAdvanced(lottery: LotteryId): Promise<AdvancedAnalysisResponse> {
    const contests = await this.contests.listAnalysisHistory(lottery);
    const signature = analysisSignature(contests);
    const cached = this.advancedAnalysisCache.get(lottery);
    let advanced: AdvancedAnalysis;

    if (cached?.signature === signature) {
      advanced = cached.value;
    } else {
      const existing = this.advancedAnalysisInFlight.get(lottery);
      if (existing?.signature === signature) {
        advanced = await existing.promise;
      } else {
        const promise = runAdvancedAnalysisInWorker(contests, lottery);
        this.advancedAnalysisInFlight.set(lottery, { signature, promise });
        try {
          advanced = await promise;
          this.advancedAnalysisCache.set(lottery, { signature, value: advanced });
        } finally {
          const current = this.advancedAnalysisInFlight.get(lottery);
          if (current?.promise === promise) this.advancedAnalysisInFlight.delete(lottery);
        }
      }
    }

    return { lottery, advanced };
  }

  async generate(input: GenerateGamesRequest): Promise<GenerateGamesResponse> {
    return this.generateGames.execute(input);
  }

  async checkBatch(batchId: number, contestNumber: number): Promise<CheckGameBatchResult> {
    return this.checkGameBatch.execute(batchId, contestNumber);
  }

  async runBacktest(input: RunBacktestRequest): Promise<RunBacktestResponse> {
    return this.runBacktestUseCase.execute(input);
  }

  async listBacktests(lottery: LotteryId, limit: number): Promise<BacktestRunSummaryRecord[]> {
    return this.backtests.listRecentSummaries(lottery, limit);
  }

  async upsertStrategy(input: UpsertStrategyInput): Promise<StrategyRecord> {
    return this.strategies.upsert(input);
  }
}
