import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  AnalysisWeights,
  Contest,
  LotteryId,
  NumberAnalysis,
  NumberTier,
} from "../domain/types.js";
import type { buildAdvancedAnalysis } from "../analysis/advanced.js";
import { runAdvancedAnalysisInWorker } from "../analysis/advancedWorkerClient.js";
import { buildNumberAnalysis, DEFAULT_WEIGHTS } from "../analysis/scoring.js";
import { getLotteryConfig } from "../lotteries/config.js";
import { generateMegaSenaGames } from "../generator/megaSena.js";
import { generateLotofacilGames } from "../generator/lotofacil.js";
import { generateDiaDeSorteGames } from "../generator/diaDeSorte.js";
import type { GenerationMode } from "../generator/shared.js";
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

export const MIN_GENERATION_HISTORY = 20;
export const MAX_HTTP_BACKTEST_ROUNDS = 500;

export type AdvancedAnalysis = ReturnType<typeof buildAdvancedAnalysis>;

export interface AnalysisResponse {
  lottery: LotteryId;
  latestContest: Contest | null;
  weights: AnalysisWeights;
  tiers: Record<NumberTier, number[]>;
  numbers: NumberAnalysis[];
}

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

export class InsufficientGenerationHistoryError extends Error {
  constructor(
    readonly lottery: LotteryId,
    readonly available: number,
    readonly required = MIN_GENERATION_HISTORY,
  ) {
    super(`At least ${required} historical contests are required to generate games for ${lottery}; ${available} available`);
  }
}

export class BacktestRoundLimitError extends Error {
  constructor(readonly requested: number, readonly maximum = MAX_HTTP_BACKTEST_ROUNDS) {
    super(`Backtest would process ${requested} contests; the HTTP limit is ${maximum}`);
  }
}

export interface GenerateGamesRequest {
  lottery: LotteryId;
  gameCount: number;
  fixedCount?: 8 | 9 | 10;
  targetContestNumber?: number;
  generationMode?: GenerationMode;
  seed?: string;
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

function gameFingerprint(games: GeneratedGameBatchRecord["games"]): string {
  return games
    .map((game) => `${game.numbers.join("-")}:${game.luckyMonth ?? ""}`)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
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
  private readonly advancedAnalysisCache = new Map<LotteryId, AdvancedAnalysisCacheEntry>();
  private readonly advancedAnalysisInFlight = new Map<LotteryId, AdvancedAnalysisInFlightEntry>();

  constructor(pool: Pool) {
    this.contests = new PostgresContestRepository(pool);
    this.games = new PostgresGameRepository(pool);
    this.strategies = new PostgresStrategyRepository(pool);
    this.backtests = new PostgresBacktestRepository(pool);
  }

  async analyze(lottery: LotteryId): Promise<AnalysisResponse> {
    const contests = await this.contests.listAnalysisHistory(lottery);
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
    const contests = await this.contests.list({ lottery: input.lottery, order: "asc" });
    const latestContest = contests.at(-1);
    const history = input.targetContestNumber === undefined
      ? contests
      : contests.filter((contest) => contest.number < input.targetContestNumber!);
    if (history.length < MIN_GENERATION_HISTORY) {
      throw new InsufficientGenerationHistoryError(input.lottery, history.length);
    }

    const targetContestNumber = input.targetContestNumber ??
      (latestContest ? latestContest.number + 1 : undefined);
    const generationMode = input.generationMode ?? "diversified";
    const fixedCount = input.lottery === "lotofacil" ? input.fixedCount ?? 8 : undefined;
    const recentBatches = input.persist && generationMode === "diversified" && input.seed === undefined
      ? await this.games.listRecent(input.lottery, 100)
      : [];
    const existingFingerprints = new Set(
      recentBatches
        .filter((batch) => batch.targetContestNumber === targetContestNumber)
        .map((batch) => gameFingerprint(batch.games)),
    );

    let generatedGames: GeneratedGameBatchRecord["games"] = [];
    let seed = generationMode === "diversified" ? input.seed ?? randomUUID() : undefined;
    let generatorOptions: Record<string, unknown> = {};
    let unique = false;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      generatorOptions = {
        gameCount: input.gameCount,
        generationMode,
        ...(seed !== undefined ? { seed } : {}),
        ...(fixedCount !== undefined ? { fixedCount } : {}),
      };

      if (input.lottery === "mega-sena") {
        generatedGames = generateMegaSenaGames(history, {
          gameCount: input.gameCount,
          generationMode,
          ...(seed !== undefined ? { seed } : {}),
        });
      } else if (input.lottery === "lotofacil") {
        generatedGames = generateLotofacilGames(history, {
          gameCount: input.gameCount,
          fixedCount: fixedCount!,
          generationMode,
          ...(seed !== undefined ? { seed } : {}),
        });
      } else {
        generatedGames = generateDiaDeSorteGames(history, {
          gameCount: input.gameCount,
          generationMode,
          ...(seed !== undefined ? { seed } : {}),
        });
      }

      if (
        !input.persist ||
        generationMode === "deterministic" ||
        input.seed !== undefined ||
        !existingFingerprints.has(gameFingerprint(generatedGames))
      ) {
        unique = true;
        break;
      }

      seed = randomUUID();
    }

    if (!unique) {
      throw new Error("Unable to generate a distinct diversified batch after multiple attempts");
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
