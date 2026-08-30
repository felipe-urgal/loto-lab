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
import { backtestMegaSena } from "../backtest/megaSena.js";
import { backtestLotofacil } from "../backtest/lotofacil.js";
import { backtestDiaDeSorte } from "../backtest/diaDeSorte.js";
import { PostgresContestRepository } from "../persistence/contestRepository.js";
import { PostgresGameRepository } from "../persistence/gameRepository.js";
import { PostgresStrategyRepository } from "../persistence/strategyRepository.js";
import { PostgresBacktestRepository } from "../persistence/backtestRepository.js";
import type {
  BacktestRoundArtifact,
  BacktestRunSummaryRecord,
  StrategyRecord,
  UpsertStrategyInput,
} from "../persistence/types.js";

export { InsufficientGenerationHistoryError, MIN_GENERATION_HISTORY };
export type { AnalysisResponse, GenerateGamesRequest, GenerateGamesResponse };

export const MAX_HTTP_BACKTEST_ROUNDS = 500;

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

export class BacktestRoundLimitError extends Error {
  constructor(readonly requested: number, readonly maximum = MAX_HTTP_BACKTEST_ROUNDS) {
    super(`Backtest would process ${requested} contests; the HTTP limit is ${maximum}`);
  }
}

export interface RunBacktestRequest {
  lottery: LotteryId;
  gameCount: number;
  warmupContests: number;
  fixedCount?: 8 | 9 | 10;
  startContest?: number;
  endContest?: number;
  persist: boolean;
}

export interface RunBacktestResponse {
  id?: number;
  lottery: LotteryId;
  options: Record<string, unknown>;
  summary: Record<string, unknown>;
  roundCount: number;
  createdAt?: string;
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

function compactBacktestRound(round: BacktestRoundArtifact): BacktestRoundArtifact {
  const compact: BacktestRoundArtifact = { contest: round.contest };
  for (const key of ["date", "targetNumbers", "hitsByGame", "bestHits", "fixedHits"] as const) {
    if (round[key] !== undefined) compact[key] = round[key];
  }
  return compact;
}

export class LotoLabApiServices {
  readonly contests: PostgresContestRepository;
  readonly games: PostgresGameRepository;
  readonly strategies: PostgresStrategyRepository;
  readonly backtests: PostgresBacktestRepository;
  private readonly analyzeLottery: AnalyzeLotteryUseCase;
  private readonly checkGameBatch: CheckGameBatchUseCase;
  private readonly generateGames: GenerateGamesUseCase;
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
    const contests = await this.contests.list({ lottery: input.lottery, order: "asc" });
    const eligibleRoundCount = contests
      .slice(input.warmupContests)
      .filter((contest) => input.startContest === undefined || contest.number >= input.startContest)
      .filter((contest) => input.endContest === undefined || contest.number <= input.endContest)
      .length;
    if (eligibleRoundCount > MAX_HTTP_BACKTEST_ROUNDS) {
      throw new BacktestRoundLimitError(eligibleRoundCount);
    }

    const options: Record<string, unknown> = {
      gameCount: input.gameCount,
      warmupContests: input.warmupContests,
      ...(input.startContest !== undefined ? { startContest: input.startContest } : {}),
      ...(input.endContest !== undefined ? { endContest: input.endContest } : {}),
    };

    let result: {
      rounds: Array<{ contest: number }>;
      summary: unknown;
    };

    if (input.lottery === "mega-sena") {
      result = backtestMegaSena(contests, {
        gameCount: input.gameCount,
        warmupContests: input.warmupContests,
        ...(input.startContest !== undefined ? { startContest: input.startContest } : {}),
        ...(input.endContest !== undefined ? { endContest: input.endContest } : {}),
      });
    } else if (input.lottery === "lotofacil") {
      const fixedCount = input.fixedCount ?? 8;
      options.fixedCount = fixedCount;
      result = backtestLotofacil(contests, {
        gameCount: input.gameCount,
        fixedCount,
        warmupContests: input.warmupContests,
        ...(input.startContest !== undefined ? { startContest: input.startContest } : {}),
        ...(input.endContest !== undefined ? { endContest: input.endContest } : {}),
      });
    } else {
      result = backtestDiaDeSorte(contests, {
        gameCount: input.gameCount,
        warmupContests: input.warmupContests,
        ...(input.startContest !== undefined ? { startContest: input.startContest } : {}),
        ...(input.endContest !== undefined ? { endContest: input.endContest } : {}),
      });
    }

    const summary = result.summary as Record<string, unknown>;
    const rounds = result.rounds as unknown as BacktestRoundArtifact[];

    if (!input.persist) {
      return {
        lottery: input.lottery,
        options,
        summary,
        roundCount: rounds.length,
      };
    }

    const saved = await this.backtests.save({
      lottery: input.lottery,
      options,
      summary,
      rounds: rounds.map(compactBacktestRound),
    });

    return {
      id: saved.id,
      lottery: saved.lottery,
      options: saved.options ?? {},
      summary: saved.summary,
      roundCount: saved.rounds.length,
      createdAt: saved.createdAt,
    };
  }

  async listBacktests(lottery: LotteryId, limit: number): Promise<BacktestRunSummaryRecord[]> {
    return this.backtests.listRecentSummaries(lottery, limit);
  }

  async upsertStrategy(input: UpsertStrategyInput): Promise<StrategyRecord> {
    return this.strategies.upsert(input);
  }
}
