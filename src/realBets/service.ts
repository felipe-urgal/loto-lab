import type { Pool } from "pg";
import type { LotteryId } from "../domain/types.js";
import { evaluateGames } from "../checker/evaluate.js";
import { PostgresContestRepository } from "../persistence/contestRepository.js";
import { PostgresGameRepository } from "../persistence/gameRepository.js";
import {
  PostgresRealBetRepository,
  type RealBetRecord,
  type RealBetSummary,
} from "../persistence/realBetRepository.js";

export interface CreateRealBetRequest {
  batchId: number;
  contestNumber?: number;
  gamePositions?: number[];
  actualCost: number;
  playedAt?: string;
}

export class RealBetService {
  readonly contests: PostgresContestRepository;
  readonly batches: PostgresGameRepository;
  readonly realBets: PostgresRealBetRepository;

  constructor(pool: Pool) {
    this.contests = new PostgresContestRepository(pool);
    this.batches = new PostgresGameRepository(pool);
    this.realBets = new PostgresRealBetRepository(pool);
  }

  async create(input: CreateRealBetRequest): Promise<RealBetRecord> {
    const batch = await this.batches.findBatch(input.batchId);
    if (!batch) throw new Error(`BATCH_NOT_FOUND:${input.batchId}`);

    const existing = await this.realBets.findByBatchId(input.batchId);
    if (existing) throw new Error(`REAL_BET_ALREADY_EXISTS:${existing.id}`);

    const contestNumber = input.contestNumber ?? batch.targetContestNumber;
    if (!contestNumber) throw new Error("CONTEST_NUMBER_REQUIRED");
    if (batch.targetContestNumber !== undefined && contestNumber !== batch.targetContestNumber) {
      throw new Error(`CONTEST_TARGET_MISMATCH:${batch.targetContestNumber}:${contestNumber}`);
    }

    // A real-performance record must be auditable without hindsight. If the
    // official result is already stored, this batch belongs in backtest/history,
    // not in the live real-bet KPI.
    const knownResult = await this.contests.findByNumber(batch.lottery, contestNumber);
    if (knownResult) throw new Error(`RESULT_ALREADY_KNOWN:${contestNumber}`);

    const positions = input.gamePositions?.length
      ? [...new Set(input.gamePositions)]
      : batch.games.map((_, index) => index + 1);
    if (positions.length === 0 || positions.some((position) => !Number.isInteger(position) || position < 1 || position > batch.games.length)) {
      throw new Error("INVALID_GAME_POSITIONS");
    }

    const games = positions
      .sort((a, b) => a - b)
      .map((position) => ({ batchPosition: position, game: batch.games[position - 1]! }));
    const playedAt = input.playedAt ?? new Date().toISOString();
    if (!Number.isFinite(new Date(playedAt).getTime())) throw new Error("INVALID_PLAYED_AT");

    let created: RealBetRecord;
    try {
      created = await this.realBets.create({
        batchId: batch.id,
        lottery: batch.lottery,
        contestNumber,
        actualCost: input.actualCost,
        playedAt,
        games,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "REAL_BET_ALREADY_EXISTS") {
        const concurrent = await this.realBets.findByBatchId(input.batchId);
        throw new Error(`REAL_BET_ALREADY_EXISTS:${concurrent?.id ?? "unknown"}`);
      }
      throw error;
    }

    return created;
  }

  async reconcile(id: number): Promise<RealBetRecord | undefined> {
    const bet = await this.realBets.findById(id);
    if (!bet) return undefined;

    // A statistical check can finish before CAIXA publishes every financial
    // tier. Keep such records reconcilable until totalPrizeValue is known.
    if (bet.status === "checked" && bet.totalPrizeValue !== undefined) return bet;

    const contest = await this.contests.findByNumber(bet.lottery, bet.contestNumber);
    if (!contest) return bet;

    const checks = evaluateGames(bet.games.map((item) => item.game), contest);
    return this.realBets.markChecked(id, checks);
  }

  async reconcilePending(lottery?: LotteryId): Promise<number> {
    const pending = await this.realBets.listPending(lottery);
    let financiallyResolved = 0;
    for (const bet of pending) {
      const beforeKnown = bet.totalPrizeValue !== undefined;
      const after = await this.reconcile(bet.id);
      if (after?.status === "checked" && after.totalPrizeValue !== undefined && !beforeKnown) {
        financiallyResolved += 1;
      }
    }
    return financiallyResolved;
  }

  async list(lottery: LotteryId, limit = 50): Promise<{ items: RealBetRecord[]; summary: RealBetSummary }> {
    const [items, summary] = await Promise.all([
      this.realBets.listRecent(lottery, limit),
      this.realBets.summary(lottery),
    ]);
    return { items, summary };
  }
}
