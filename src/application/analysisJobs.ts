import type { Contest, LotteryId } from "../domain/types.js";
import type { StrategyLabExperiment } from "../lab/strategyLab.js";
import { MAX_BACKTEST_ROUNDS } from "./runBacktest.js";
import {
  validateStrategyLabExecution,
  type StrategyLabRunRequest,
} from "./runStrategyLab.js";

export type AnalysisJobKind = "backtest" | "strategy-lab";
export type AnalysisJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface ApplicationAnalysisJobRecord {
  id: number;
  kind: AnalysisJobKind;
  lottery: LotteryId;
  status: AnalysisJobStatus;
  input: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code?: string; message: string };
  cancelRequested: boolean;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface AnalysisJobQueue {
  enqueue(
    kind: AnalysisJobKind,
    lottery: LotteryId,
    input: Record<string, unknown>,
  ): Promise<ApplicationAnalysisJobRecord>;
  list(limit: number, lottery?: LotteryId): Promise<ApplicationAnalysisJobRecord[]>;
  findById(id: number): Promise<ApplicationAnalysisJobRecord | undefined>;
  cancel(id: number): Promise<ApplicationAnalysisJobRecord | undefined>;
}

export interface AnalysisJobStrategyVersion {
  id: number;
  strategyId: number;
  config: Record<string, unknown>;
}

export interface AnalysisJobStrategy {
  id: number;
  lottery: LotteryId;
}

export interface AnalysisJobStrategyReader {
  findVersionById(id: number): Promise<AnalysisJobStrategyVersion | undefined>;
  findById(id: number): Promise<AnalysisJobStrategy | undefined>;
}

export interface AnalysisJobHistoryReader {
  list(options: { lottery: LotteryId; order: "asc" }): Promise<Contest[]>;
}

export interface EnqueueAnalysisJobRequest {
  kind: AnalysisJobKind;
  lottery: LotteryId;
  values: Record<string, unknown>;
}

export class AnalysisJobInputError extends Error {
  readonly code = "INVALID_ARGUMENT";
}

export class AnalysisJobTooLargeError extends Error {
  readonly code = "ANALYSIS_TOO_LARGE";

  constructor(
    readonly requested: number,
    readonly maximum = MAX_BACKTEST_ROUNDS,
  ) {
    super(`Backtest would process ${requested} contests; the safe limit is ${maximum}`);
  }
}

export class AnalysisJobStrategyVersionNotFoundError extends Error {
  readonly code = "STRATEGY_VERSION_NOT_FOUND";

  constructor(readonly strategyVersionId: number) {
    super(`Strategy version ${strategyVersionId} was not found`);
  }
}

export class AnalysisJobStrategyNotFoundError extends Error {
  readonly code = "STRATEGY_NOT_FOUND";

  constructor(readonly strategyId: number) {
    super(`Strategy ${strategyId} was not found`);
  }
}

export class AnalysisJobStrategyLotteryMismatchError extends Error {
  readonly code = "STRATEGY_LOTTERY_MISMATCH";

  constructor(
    readonly strategyVersionId: number,
    readonly strategyLottery: LotteryId,
  ) {
    super(`Strategy version ${strategyVersionId} belongs to ${strategyLottery}`);
  }
}

export class AnalysisJobNotFoundError extends Error {
  readonly code = "ANALYSIS_JOB_NOT_FOUND";

  constructor(readonly analysisJobId: number) {
    super(`Analysis job ${analysisJobId} was not found`);
  }
}

function value(values: Record<string, unknown>, config: Record<string, unknown>, key: string): unknown {
  return values[key] ?? config[key];
}

function parsePositiveInt(
  raw: unknown,
  field: string,
  options: { min?: number; max?: number; defaultValue?: number } = {},
): number {
  if ((raw === undefined || raw === null || raw === "") && options.defaultValue !== undefined) {
    return options.defaultValue;
  }
  const parsed = typeof raw === "number" ? raw : Number(raw);
  const min = options.min ?? 1;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new AnalysisJobInputError(`${field} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function parseOptionalPositiveInt(raw: unknown, field: string): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  return parsePositiveInt(raw, field);
}

function parseFixedCount(raw: unknown): 8 | 9 | 10 {
  const fixed = parsePositiveInt(raw, "fixedCount", { min: 8, max: 10, defaultValue: 8 });
  if (fixed !== 8 && fixed !== 9 && fixed !== 10) {
    throw new AnalysisJobInputError("fixedCount must be 8, 9 or 10");
  }
  return fixed;
}

function validateRange(startContest: number | undefined, endContest: number | undefined): void {
  if (startContest !== undefined && endContest !== undefined && startContest > endContest) {
    throw new AnalysisJobInputError("startContest must be less than or equal to endContest");
  }
}

function parseStrategyLabExperiment(raw: unknown): StrategyLabExperiment {
  if (raw === undefined || raw === null || raw === "") return "fixed-core";
  if (raw === "fixed-core" || raw === "external-rules" || raw === "score-model") return raw;
  throw new AnalysisJobInputError("experiment must be fixed-core, external-rules or score-model");
}

function parseStrategyLabInput(values: Record<string, unknown>, lottery: LotteryId): StrategyLabRunRequest {
  const experiment = parseStrategyLabExperiment(values.experiment);
  if (experiment === "external-rules" && lottery !== "mega-sena") {
    throw new AnalysisJobInputError("external-rules experiment is available only for Mega-Sena");
  }

  const gameCount = parsePositiveInt(values.gameCount, "gameCount", {
    min: 1,
    max: 10,
    defaultValue: lottery === "mega-sena" ? 2 : 4,
  });
  const warmupContests = parsePositiveInt(values.warmupContests, "warmupContests", {
    min: 1,
    max: 500,
    defaultValue: 20,
  });
  const lookbackContests = parsePositiveInt(values.lookbackContests, "lookbackContests", {
    min: 10,
    max: 500,
    defaultValue: 200,
  });
  const bucketSize = parsePositiveInt(values.bucketSize, "bucketSize", {
    min: 5,
    max: 100,
    defaultValue: 25,
  });
  const randomSamples = parsePositiveInt(values.randomSamples, "randomSamples", {
    min: 10,
    max: 500,
    defaultValue: experiment === "external-rules" ? 250 : 100,
  });
  const startContest = parseOptionalPositiveInt(values.startContest, "startContest");
  const endContest = parseOptionalPositiveInt(values.endContest, "endContest");
  validateRange(startContest, endContest);

  return {
    lottery,
    experiment,
    gameCount,
    warmupContests,
    lookbackContests,
    bucketSize,
    randomSamples,
    ...(startContest !== undefined ? { startContest } : {}),
    ...(endContest !== undefined ? { endContest } : {}),
  };
}

export class AnalysisJobsUseCase {
  constructor(
    private readonly queue: AnalysisJobQueue,
    private readonly strategies: AnalysisJobStrategyReader,
    private readonly history: AnalysisJobHistoryReader,
  ) {}

  async list(limit: number, lottery?: LotteryId): Promise<ApplicationAnalysisJobRecord[]> {
    return this.queue.list(limit, lottery);
  }

  async findById(id: number): Promise<ApplicationAnalysisJobRecord> {
    const job = await this.queue.findById(id);
    if (!job) throw new AnalysisJobNotFoundError(id);
    return job;
  }

  async cancel(id: number): Promise<ApplicationAnalysisJobRecord> {
    const job = await this.queue.cancel(id);
    if (!job) throw new AnalysisJobNotFoundError(id);
    return job;
  }

  async enqueue(request: EnqueueAnalysisJobRequest): Promise<ApplicationAnalysisJobRecord> {
    const strategy = await this.resolveStrategy(request.values, request.lottery);
    const config = strategy.version?.config ?? {};

    const input = request.kind === "backtest"
      ? await this.backtestInput(request.values, config, request.lottery, strategy)
      : await this.strategyLabInput(request.values, config, request.lottery, strategy);

    return this.queue.enqueue(request.kind, request.lottery, input);
  }

  private async resolveStrategy(
    values: Record<string, unknown>,
    lottery: LotteryId,
  ): Promise<{ version?: AnalysisJobStrategyVersion; strategyId?: number }> {
    const rawId = values.strategyVersionId;
    if (rawId === undefined || rawId === null || rawId === "") return {};

    const id = parsePositiveInt(rawId, "strategyVersionId");
    const version = await this.strategies.findVersionById(id);
    if (!version) throw new AnalysisJobStrategyVersionNotFoundError(id);

    const strategy = await this.strategies.findById(version.strategyId);
    if (!strategy) throw new AnalysisJobStrategyNotFoundError(version.strategyId);
    if (strategy.lottery !== lottery) {
      throw new AnalysisJobStrategyLotteryMismatchError(id, strategy.lottery);
    }

    return { version, strategyId: strategy.id };
  }

  private async backtestInput(
    values: Record<string, unknown>,
    config: Record<string, unknown>,
    lottery: LotteryId,
    strategy: { version?: AnalysisJobStrategyVersion; strategyId?: number },
  ): Promise<Record<string, unknown>> {
    const gameCount = parsePositiveInt(value(values, config, "gameCount"), "gameCount", {
      min: 1,
      max: 10,
      defaultValue: lottery === "mega-sena" ? 2 : 4,
    });
    const warmupContests = parsePositiveInt(value(values, config, "warmupContests"), "warmupContests", {
      min: 1,
      max: 500,
      defaultValue: 20,
    });
    const startContest = parseOptionalPositiveInt(value(values, config, "startContest"), "startContest");
    const endContest = parseOptionalPositiveInt(value(values, config, "endContest"), "endContest");
    validateRange(startContest, endContest);

    const contests = await this.history.list({ lottery, order: "asc" });
    const eligibleRounds = contests
      .slice(warmupContests)
      .filter((contest) => startContest === undefined || contest.number >= startContest)
      .filter((contest) => endContest === undefined || contest.number <= endContest)
      .length;
    if (eligibleRounds > MAX_BACKTEST_ROUNDS) {
      throw new AnalysisJobTooLargeError(eligibleRounds);
    }

    return {
      lottery,
      gameCount,
      warmupContests,
      persist: true,
      eligibleRounds,
      ...(lottery === "lotofacil" ? { fixedCount: parseFixedCount(value(values, config, "fixedCount")) } : {}),
      ...(startContest !== undefined ? { startContest } : {}),
      ...(endContest !== undefined ? { endContest } : {}),
      ...(strategy.strategyId !== undefined ? { strategyId: strategy.strategyId } : {}),
      ...(strategy.version ? { strategyVersionId: strategy.version.id } : {}),
    };
  }

  private async strategyLabInput(
    values: Record<string, unknown>,
    config: Record<string, unknown>,
    lottery: LotteryId,
    strategy: { version?: AnalysisJobStrategyVersion },
  ): Promise<Record<string, unknown>> {
    const labInput = parseStrategyLabInput({ ...config, ...values }, lottery);
    const contests = await this.history.list({ lottery, order: "asc" });
    const budget = validateStrategyLabExecution(contests, labInput);

    return {
      ...labInput,
      eligibleTargets: budget.eligibleTargets,
      estimatedWorkUnits: budget.estimatedWorkUnits,
      ...(strategy.version ? { strategyVersionId: strategy.version.id } : {}),
    };
  }
}
