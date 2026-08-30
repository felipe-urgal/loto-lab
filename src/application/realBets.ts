import type { LotteryId } from "../domain/types.js";

export interface CreateRealBetRequest {
  batchId: number;
  contestNumber?: number;
  gamePositions?: number[];
  actualCost: number;
  playedAt?: string;
}

export interface RealBetSnapshot {
  id: number;
  lottery: LotteryId;
  contestNumber: number;
  status: string;
}

export interface RealBetOperations {
  create(input: CreateRealBetRequest): Promise<unknown>;
  reconcilePending(lottery?: LotteryId): Promise<number>;
  reconcile(id: number): Promise<RealBetSnapshot | undefined>;
  list(lottery: LotteryId, limit: number): Promise<unknown>;
}

export interface RealBetRevisionReader {
  findById(id: number): Promise<RealBetSnapshot | undefined>;
  listFinancialRevisions(id: number): Promise<unknown[]>;
}

export type RealBetUseCaseErrorCode =
  | "BATCH_NOT_FOUND"
  | "REAL_BET_ALREADY_EXISTS"
  | "CONTEST_TARGET_MISMATCH"
  | "RESULT_ALREADY_KNOWN"
  | "CONTEST_NUMBER_REQUIRED"
  | "INVALID_GAME_POSITIONS"
  | "INVALID_PLAYED_AT"
  | "REAL_BET_NOT_FOUND"
  | "RESULT_NOT_AVAILABLE";

export class RealBetUseCaseError extends Error {
  constructor(
    readonly code: RealBetUseCaseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RealBetUseCaseError";
  }
}

function translateCreateError(error: unknown): RealBetUseCaseError | undefined {
  if (!(error instanceof Error)) return undefined;
  if (error.message.startsWith("BATCH_NOT_FOUND:")) {
    const id = error.message.split(":")[1];
    return new RealBetUseCaseError("BATCH_NOT_FOUND", `Game batch ${id} was not found`);
  }
  if (error.message.startsWith("REAL_BET_ALREADY_EXISTS:")) {
    return new RealBetUseCaseError(
      "REAL_BET_ALREADY_EXISTS",
      "This generated batch is already marked as a real bet",
    );
  }
  if (error.message.startsWith("CONTEST_TARGET_MISMATCH:")) {
    const [, expected, received] = error.message.split(":");
    return new RealBetUseCaseError(
      "CONTEST_TARGET_MISMATCH",
      `This batch targets contest ${expected}; it cannot be registered as a real bet for contest ${received}`,
    );
  }
  if (error.message.startsWith("RESULT_ALREADY_KNOWN:")) {
    const contest = error.message.split(":")[1];
    return new RealBetUseCaseError(
      "RESULT_ALREADY_KNOWN",
      `Contest ${contest} is already stored. Historical results cannot be registered as live real bets.`,
    );
  }
  if (error.message === "CONTEST_NUMBER_REQUIRED") {
    return new RealBetUseCaseError(
      "CONTEST_NUMBER_REQUIRED",
      "A contest number is required for a real bet",
    );
  }
  if (error.message === "INVALID_GAME_POSITIONS") {
    return new RealBetUseCaseError(
      "INVALID_GAME_POSITIONS",
      "gamePositions contains a game that does not exist in the batch",
    );
  }
  if (error.message === "INVALID_PLAYED_AT") {
    return new RealBetUseCaseError("INVALID_PLAYED_AT", "playedAt is invalid");
  }
  return undefined;
}

export class RealBetUseCase {
  constructor(
    private readonly operations: RealBetOperations,
    private readonly revisions: RealBetRevisionReader,
  ) {}

  async create(input: CreateRealBetRequest): Promise<unknown> {
    try {
      return await this.operations.create(input);
    } catch (error) {
      const translated = translateCreateError(error);
      if (translated) throw translated;
      throw error;
    }
  }

  async reconcilePending(lottery?: LotteryId): Promise<{ checked: number }> {
    return { checked: await this.operations.reconcilePending(lottery) };
  }

  async check(id: number): Promise<RealBetSnapshot> {
    const item = await this.operations.reconcile(id);
    if (!item) {
      throw new RealBetUseCaseError("REAL_BET_NOT_FOUND", `Real bet ${id} was not found`);
    }
    if (item.status !== "checked") {
      throw new RealBetUseCaseError(
        "RESULT_NOT_AVAILABLE",
        `Contest ${item.contestNumber} is not stored yet for ${item.lottery}`,
      );
    }
    return item;
  }

  async financialRevisions(id: number): Promise<{ realBetId: number; revisions: unknown[] }> {
    const item = await this.revisions.findById(id);
    if (!item) {
      throw new RealBetUseCaseError("REAL_BET_NOT_FOUND", `Real bet ${id} was not found`);
    }
    return {
      realBetId: id,
      revisions: await this.revisions.listFinancialRevisions(id),
    };
  }

  list(lottery: LotteryId, limit: number): Promise<unknown> {
    return this.operations.list(lottery, limit);
  }
}
