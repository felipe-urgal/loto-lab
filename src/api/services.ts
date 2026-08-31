import type { Pool } from "pg";
import type { AdvancedAnalysis } from "../analysis/advancedTypes.js";
import type { AdvancedAnalysisResponse } from "../application/analyzeAdvancedLottery.js";
import type { AnalysisResponse } from "../application/analyzeLottery.js";
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
  MAX_BACKTEST_ROUNDS,
  RunBacktestUseCase,
  type RunBacktestRequest,
  type RunBacktestResponse,
} from "../application/runBacktest.js";
import { PostgresContestRepository } from "../persistence/contestRepository.js";
import { PostgresGameRepository } from "../persistence/gameRepository.js";
import { PostgresStrategyRepository } from "../persistence/strategyRepository.js";
import { PostgresBacktestRepository } from "../persistence/backtestRepository.js";
import type { StrategyRecord, UpsertStrategyInput } from "../persistence/types.js";

export {
  BacktestRoundLimitError,
  InsufficientGenerationHistoryError,
  MIN_GENERATION_HISTORY,
};
export const MAX_HTTP_BACKTEST_ROUNDS = MAX_BACKTEST_ROUNDS;
export type {
  AdvancedAnalysis,
  AdvancedAnalysisResponse,
  AnalysisResponse,
  GenerateGamesRequest,
  GenerateGamesResponse,
  RunBacktestRequest,
  RunBacktestResponse,
};

export class LotoLabApiServices {
  readonly contests: PostgresContestRepository;
  readonly games: PostgresGameRepository;
  readonly strategies: PostgresStrategyRepository;
  readonly backtests: PostgresBacktestRepository;
  private readonly checkGameBatch: CheckGameBatchUseCase;
  private readonly generateGames: GenerateGamesUseCase;
  private readonly runBacktestUseCase: RunBacktestUseCase;

  constructor(pool: Pool) {
    this.contests = new PostgresContestRepository(pool);
    this.games = new PostgresGameRepository(pool);
    this.strategies = new PostgresStrategyRepository(pool);
    this.backtests = new PostgresBacktestRepository(pool);
    this.checkGameBatch = new CheckGameBatchUseCase(this.games, this.contests);
    this.generateGames = new GenerateGamesUseCase(this.contests, this.games);
    this.runBacktestUseCase = new RunBacktestUseCase(this.contests, this.backtests);
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

  async upsertStrategy(input: UpsertStrategyInput): Promise<StrategyRecord> {
    return this.strategies.upsert(input);
  }
}
