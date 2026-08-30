import { eligibleTargetIndexes } from "../analysis/contestEligibility.js";
import type { Contest, LotteryId } from "../domain/types.js";
import {
  resolveStrategyLabPeriod,
  type StrategyLabExperiment,
  type StrategyLabOptions,
  type StrategyLabResult,
} from "../lab/strategyLab.js";

export const MAX_ESTIMATED_LAB_WORK_UNITS = 750_000;

export type StrategyLabRunRequest = StrategyLabOptions & {
  lottery: LotteryId;
  experiment: StrategyLabExperiment;
  gameCount: number;
  warmupContests: number;
  lookbackContests: number;
  bucketSize: number;
  randomSamples: number;
};

export interface StrategyLabHistoryReader {
  list(options: { lottery: LotteryId; order: "asc" }): Promise<Contest[]>;
}

export interface StrategyLabWorkGate {
  acquire(): (() => void) | undefined;
}

export type StrategyLabExecutor = (
  contests: Contest[],
  input: StrategyLabRunRequest,
  signal?: AbortSignal,
) => Promise<StrategyLabResult>;

export class InsufficientStrategyLabHistoryError extends Error {
  readonly code = "INSUFFICIENT_HISTORY";

  constructor(readonly required: number) {
    super(`At least ${required} contests are required to compare strategies`);
    this.name = "InsufficientStrategyLabHistoryError";
  }
}

export class EmptyStrategyLabPeriodError extends Error {
  readonly code = "EMPTY_PERIOD";

  constructor() {
    super("The requested period has no eligible contests after warmup and continuity checks.");
    this.name = "EmptyStrategyLabPeriodError";
  }
}

export class StrategyLabTooLargeError extends Error {
  readonly code = "ANALYSIS_TOO_LARGE";

  constructor(
    readonly estimatedWorkUnits: number,
    readonly maximum = MAX_ESTIMATED_LAB_WORK_UNITS,
  ) {
    super("Requested Strategy Lab run is too large. Reduce the effective contest period, games per contest, or random controls.");
    this.name = "StrategyLabTooLargeError";
  }
}

export class StrategyLabBusyError extends Error {
  readonly code = "ANALYSIS_BUSY";

  constructor() {
    super("Another backtest or Strategy Lab analysis is already running");
    this.name = "StrategyLabBusyError";
  }
}

export function estimateStrategyLabWorkUnits(
  experiment: StrategyLabExperiment,
  eligibleTargets: number,
  gameCount: number,
  randomSamples: number,
): number {
  const strategyVariants = experiment === "external-rules" ? 9 : 3;
  const backtestUnits = eligibleTargets * gameCount * (randomSamples + strategyVariants + 2);
  const scoreAnalysisUnits = experiment === "score-model" ? eligibleTargets * 40 : 0;
  return backtestUnits + scoreAnalysisUnits;
}

export function validateStrategyLabExecution(
  contests: Contest[],
  input: StrategyLabRunRequest,
): { eligibleTargets: number; estimatedWorkUnits: number } {
  if (contests.length <= input.warmupContests) {
    throw new InsufficientStrategyLabHistoryError(input.warmupContests + 1);
  }

  const period = resolveStrategyLabPeriod(contests, input);
  const scoped = contests
    .filter((contest) => contest.lottery === input.lottery)
    .sort((a, b) => a.number - b.number);
  const eligibleTargets = eligibleTargetIndexes(scoped, {
    warmupContests: input.warmupContests,
    ...(period.startContest !== undefined ? { startContest: period.startContest } : {}),
    ...(period.endContest !== undefined ? { endContest: period.endContest } : {}),
  }).length;

  if (eligibleTargets === 0) {
    throw new EmptyStrategyLabPeriodError();
  }

  const estimatedWorkUnits = estimateStrategyLabWorkUnits(
    input.experiment,
    eligibleTargets,
    input.gameCount,
    input.randomSamples,
  );
  if (estimatedWorkUnits > MAX_ESTIMATED_LAB_WORK_UNITS) {
    throw new StrategyLabTooLargeError(estimatedWorkUnits);
  }

  return { eligibleTargets, estimatedWorkUnits };
}

export class RunStrategyLabUseCase {
  constructor(
    private readonly history: StrategyLabHistoryReader,
    private readonly workGate: StrategyLabWorkGate,
    private readonly executeLab: StrategyLabExecutor,
  ) {}

  async execute(input: StrategyLabRunRequest, signal?: AbortSignal): Promise<StrategyLabResult> {
    const contests = await this.history.list({ lottery: input.lottery, order: "asc" });
    validateStrategyLabExecution(contests, input);

    const release = this.workGate.acquire();
    if (!release) throw new StrategyLabBusyError();

    try {
      return await this.executeLab(contests, input, signal);
    } finally {
      release();
    }
  }
}
