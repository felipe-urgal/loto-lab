import type { Pool } from "pg";
import type { LotteryId } from "../domain/types.js";
import { normalizeIsoDateTime } from "../domain/dateTime.js";
import { discardPoolClient, releaseAdvisoryLockClient } from "../db/advisoryLock.js";
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

export interface RealBetReconciliationSummary {
  financiallyResolved: number;
  financiallyRevised: number;
}

function reconciliationLockKey(id: number): string {
  return `loto_lab_real_bet_reconcile:${id}`;
}

export class RealBetService {
  readonly contests: PostgresContestRepository;
  readonly batches: PostgresGameRepository;
  readonly realBets: PostgresRealBetRepository;

  constructor(private readonly pool: Pool) {
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

    // Real-performance records must be created before the official result is
    // known. Historical experiments belong in backtests, never in the live KPI.
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
    const requestedPlayedAt = input.playedAt ?? new Date().toISOString();
    const playedAt = normalizeIsoDateTime(requestedPlayedAt);
    if (!playedAt) throw new Error("INVALID_PLAYED_AT");

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
    const lockClient = await this.pool.connect();
    const lockKey = reconciliationLockKey(id);
    let locked = false;
    try {
      try {
        await lockClient.query(
          "SELECT pg_advisory_lock(hashtextextended($1, 0))",
          [lockKey],
        );
        locked = true;
      } catch (error) {
        throw discardPoolClient(lockClient, error);
      }

      const bet = await this.realBets.findById(id);
      if (!bet) return undefined;

      const contest = await this.contests.findByNumber(bet.lottery, bet.contestNumber);
      if (!contest) return bet;

      const checks = evaluateGames(bet.games.map((item) => item.game), contest);
      return this.realBets.markChecked(id, checks);
    } finally {
      if (locked) {
        await releaseAdvisoryLockClient(
          lockClient,
          "SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked",
          [lockKey],
        );
      }
    }
  }

  async reconcileContestNumbers(
    lottery: LotteryId,
    contestNumbers: number[],
  ): Promise<RealBetReconciliationSummary> {
    const uniqueContestNumbers = [...new Set(contestNumbers)].filter((value) => Number.isInteger(value) && value > 0);
    if (uniqueContestNumbers.length === 0) return { financiallyResolved: 0, financiallyRevised: 0 };

    const result = await this.pool.query<{ id: string }>(
      `
        SELECT id
        FROM real_bets
        WHERE lottery = $1
          AND contest_number = ANY($2::int[])
        ORDER BY contest_number, id
      `,
      [lottery, uniqueContestNumbers],
    );

    let financiallyResolved = 0;
    let financiallyRevised = 0;
    for (const row of result.rows) {
      const before = await this.realBets.findById(Number(row.id));
      if (!before) continue;
      const after = await this.reconcile(before.id);
      if (!after || after.totalPrizeValue === undefined) continue;
      if (before.totalPrizeValue === undefined) {
        financiallyResolved += 1;
      } else if (before.totalPrizeValue !== after.totalPrizeValue || before.netResult !== after.netResult) {
        financiallyRevised += 1;
      }
    }

    return { financiallyResolved, financiallyRevised };
  }

  async reconcilePending(lottery?: LotteryId): Promise<number> {
    const result = await this.pool.query<{ id: string }>(
      `
        SELECT id
        FROM real_bets
        WHERE (
          status IN ('placed', 'awaiting_result')
          OR (status = 'checked' AND total_prize_value IS NULL)
        )
          AND ($1::text IS NULL OR lottery = $1)
        ORDER BY contest_number, id
      `,
      [lottery ?? null],
    );

    let financiallyResolved = 0;
    for (const row of result.rows) {
      const bet = await this.realBets.findById(Number(row.id));
      if (!bet) continue;
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
