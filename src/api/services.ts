import type { Pool } from "pg";
import type { LotteryId } from "../domain/types.js";
import { buildNumberAnalysis, DEFAULT_WEIGHTS } from "../analysis/scoring.js";
import { getLotteryConfig } from "../lotteries/config.js";
import { generateMegaSenaGames } from "../generator/megaSena.js";
import { generateLotofacilGames } from "../generator/lotofacil.js";
import { generateDiaDeSorteGames } from "../generator/diaDeSorte.js";
import { evaluateGames } from "../checker/evaluate.js";
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
  GeneratedGameBatchRecord,
  StrategyRecord,
  UpsertStrategyInput,
} from "../persistence/types.js";

export interface GenerateGamesRequest {
  lottery: LotteryId;
  gameCount: number;
  fixedCount?: 8 | 9 | 10;
  targetContestNumber?: number;
  persist: boolean;
}

export interface GenerateGamesResponse {
  lottery: LotteryId;
  targetContestNumber?: number;
  batchId?: number;
  games: GeneratedGameBatchRecord["games"];
  generatorOptions: Record<string, unknown>;
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

export class LotoLabApiServices {
  readonly contests: PostgresContestRepository;
  readonly games: PostgresGameRepository;
  readonly strategies: PostgresStrategyRepository;
  readonly backtests: PostgresBacktestRepository;

  constructor(pool: Pool) {
    this.contests = new PostgresContestRepository(pool);
    this.games = new PostgresGameRepository(pool);
    this.strategies = new PostgresStrategyRepository(pool);
    this.backtests = new PostgresBacktestRepository(pool);
  }

  async analyze(lottery: LotteryId) {
    const contests = await this.contests.list({ lottery, order: "asc" });
    const config = getLotteryConfig(lottery);
    const rows = buildNumberAnalysis(contests, config);
    const latestContest = contests.at(-1);

    return {
      lottery,
      latestContest: latestContest ?? null,
      weights: DEFAULT_WEIGHTS,
      tiers: {
        strong: rows.filter((row) => row.tier === "strong").map((row) => row.number),
        balanced: rows.filter((row) => row.tier === "balanced").map((row) => row.number),
        cold: rows.filter((row) => row.tier === "cold").map((row) => row.number),
      },
      numbers: rows,
    };
  }

  async generate(input: GenerateGamesRequest): Promise<GenerateGamesResponse> {
    const contests = await this.contests.list({ lottery: input.lottery, order: "asc" });
    const latestContest = contests.at(-1);
    const history = input.targetContestNumber === undefined
      ? contests
      : contests.filter((contest) => contest.number < input.targetContestNumber!);
    const targetContestNumber = input.targetContestNumber ??
      (latestContest ? latestContest.number + 1 : undefined);

    let generatedGames: GeneratedGameBatchRecord["games"];
    const generatorOptions: Record<string, unknown> = { gameCount: input.gameCount };

    if (input.lottery === "mega-sena") {
      generatedGames = generateMegaSenaGames(history, input.gameCount);
    } else if (input.lottery === "lotofacil") {
      const fixedCount = input.fixedCount ?? 8;
      generatorOptions.fixedCount = fixedCount;
      generatedGames = generateLotofacilGames(history, {
        gameCount: input.gameCount,
        fixedCount,
      });
    } else {
      generatedGames = generateDiaDeSorteGames(history, input.gameCount);
    }

    if (!input.persist) {
      return {
        lottery: input.lottery,
        ...(targetContestNumber !== undefined ? { targetContestNumber } : {}),
        games: generatedGames,
        generatorOptions,
      };
    }

    const batch = await this.games.saveBatch({
      lottery: input.lottery,
      ...(targetContestNumber !== undefined ? { targetContestNumber } : {}),
      generatorOptions,
      games: generatedGames,
    });

    return {
      lottery: input.lottery,
      targetContestNumber: batch.targetContestNumber,
      batchId: batch.id,
      games: batch.games,
      generatorOptions: batch.generatorOptions,
    };
  }

  async checkBatch(batchId: number, contestNumber: number) {
    const batch = await this.games.findBatch(batchId);
    if (!batch) return undefined;
    const target = await this.contests.findByNumber(batch.lottery, contestNumber);
    if (!target) return { batch, target: undefined, checks: undefined };

    return {
      batch,
      target,
      checks: evaluateGames(batch.games, target),
    };
  }

  async runBacktest(input: RunBacktestRequest): Promise<RunBacktestResponse> {
    const contests = await this.contests.list({ lottery: input.lottery, order: "asc" });
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
      rounds,
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
