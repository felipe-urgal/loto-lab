import type { Pool } from "pg";
import type { LotteryId } from "../domain/types.js";
import type { GeneratedGame } from "../domain/types.js";
import type { GameCheckResult } from "../checker/evaluate.js";

export type RealBetStatus = "planned" | "placed" | "awaiting_result" | "checked";

export interface RealBetGameInput {
  batchPosition: number;
  game: GeneratedGame;
}

export interface CreateRealBetInput {
  batchId: number;
  lottery: LotteryId;
  contestNumber: number;
  actualCost: number;
  playedAt: string;
  games: RealBetGameInput[];
}

export interface RealBetGameRecord {
  batchPosition: number;
  game: GeneratedGame;
  checkResult?: GameCheckResult;
  prizeValue?: number;
}

export interface RealBetRecord {
  id: number;
  batchId: number;
  lottery: LotteryId;
  contestNumber: number;
  status: RealBetStatus;
  actualCost: number;
  playedAt: string;
  checkedAt?: string;
  totalPrizeValue?: number;
  netResult?: number;
  createdAt: string;
  updatedAt: string;
  games: RealBetGameRecord[];
}

export interface RealBetSummary {
  lottery: LotteryId;
  totalBets: number;
  checkedBets: number;
  financiallyCheckedBets: number;
  pendingBets: number;
  actualCost: number;
  checkedCost: number;
  totalPrizeValue: number;
  netResult: number;
  roi?: number;
}

export interface RealBetFinancialRevisionRecord {
  id: number;
  realBetId: number;
  previousTotalPrizeValue?: number;
  newTotalPrizeValue?: number;
  previousNetResult?: number;
  newNetResult?: number;
  reason: string;
  createdAt: string;
}

interface BetRow {
  id: string;
  batch_id: string;
  lottery: LotteryId;
  contest_number: number;
  status: RealBetStatus;
  actual_cost: number;
  played_at: Date;
  checked_at: Date | null;
  total_prize_value: number | null;
  net_result: number | null;
  created_at: Date;
  updated_at: Date;
}

interface BetGameRow {
  real_bet_id: string;
  batch_position: number;
  numbers: number[];
  fixed_numbers: number[];
  variable_numbers: number[];
  lucky_month: string | null;
  metadata: GeneratedGame["metadata"];
  check_result: GameCheckResult | null;
  prize_value: number | null;
}

interface FinancialRevisionRow {
  id: string;
  real_bet_id: string;
  previous_total_prize_value: number | null;
  new_total_prize_value: number | null;
  previous_net_result: number | null;
  new_net_result: number | null;
  reason: string;
  created_at: Date;
}

function mapGame(lottery: LotteryId, row: BetGameRow): RealBetGameRecord {
  return {
    batchPosition: row.batch_position,
    game: {
      lottery,
      numbers: row.numbers.map(Number),
      fixedNumbers: row.fixed_numbers.map(Number),
      variableNumbers: row.variable_numbers.map(Number),
      ...(row.lucky_month ? { luckyMonth: row.lucky_month } : {}),
      metadata: row.metadata,
    },
    ...(row.check_result ? { checkResult: row.check_result } : {}),
    ...(row.prize_value !== null ? { prizeValue: Number(row.prize_value) } : {}),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "23505",
  );
}

function sameOptionalNumber(left: number | undefined, right: number | undefined): boolean {
  return left === right;
}

export class PostgresRealBetRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateRealBetInput): Promise<RealBetRecord> {
    if (input.games.length === 0) throw new Error("A real bet must contain at least one game");
    if (!Number.isFinite(input.actualCost) || input.actualCost < 0) {
      throw new Error("actualCost must be a non-negative number");
    }
    if (input.games.some(({ game }) => game.lottery !== input.lottery)) {
      throw new Error("Every real-bet game must match the bet lottery");
    }

    const client = await this.pool.connect();
    let id = 0;
    try {
      await client.query("BEGIN");
      const inserted = await client.query<{ id: string }>(
        `
          INSERT INTO real_bets (
            batch_id, lottery, contest_number, status, actual_cost, played_at
          ) VALUES ($1, $2, $3, 'awaiting_result', $4, $5)
          RETURNING id
        `,
        [input.batchId, input.lottery, input.contestNumber, input.actualCost, input.playedAt],
      );
      id = Number(inserted.rows[0]!.id);

      for (const { batchPosition, game } of input.games) {
        await client.query(
          `
            INSERT INTO real_bet_games (
              real_bet_id, batch_position, numbers, fixed_numbers, variable_numbers,
              lucky_month, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
          `,
          [
            id,
            batchPosition,
            game.numbers,
            game.fixedNumbers,
            game.variableNumbers,
            game.luckyMonth ?? null,
            JSON.stringify(game.metadata),
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error)) throw new Error("REAL_BET_ALREADY_EXISTS");
      throw error;
    } finally {
      client.release();
    }

    const saved = await this.findById(id);
    if (!saved) throw new Error("Real bet was not found after insert");
    return saved;
  }

  private async findMany(ids: number[]): Promise<RealBetRecord[]> {
    if (ids.length === 0) return [];
    const uniqueIds = [...new Set(ids)];
    const [bets, games] = await Promise.all([
      this.pool.query<BetRow>(
        `
          SELECT
            id, batch_id, lottery, contest_number, status,
            actual_cost::float8 AS actual_cost,
            played_at, checked_at,
            total_prize_value::float8 AS total_prize_value,
            net_result::float8 AS net_result,
            created_at, updated_at
          FROM real_bets
          WHERE id = ANY($1::bigint[])
        `,
        [uniqueIds],
      ),
      this.pool.query<BetGameRow>(
        `
          SELECT
            real_bet_id, batch_position, numbers, fixed_numbers, variable_numbers,
            lucky_month, metadata, check_result, prize_value::float8 AS prize_value
          FROM real_bet_games
          WHERE real_bet_id = ANY($1::bigint[])
          ORDER BY real_bet_id, batch_position
        `,
        [uniqueIds],
      ),
    ]);

    const gamesByBet = new Map<number, BetGameRow[]>();
    for (const game of games.rows) {
      const id = Number(game.real_bet_id);
      const rows = gamesByBet.get(id) ?? [];
      rows.push(game);
      gamesByBet.set(id, rows);
    }

    const byId = new Map<number, RealBetRecord>();
    for (const row of bets.rows) {
      const id = Number(row.id);
      byId.set(id, {
        id,
        batchId: Number(row.batch_id),
        lottery: row.lottery,
        contestNumber: row.contest_number,
        status: row.status,
        actualCost: Number(row.actual_cost),
        playedAt: row.played_at.toISOString(),
        ...(row.checked_at ? { checkedAt: row.checked_at.toISOString() } : {}),
        ...(row.total_prize_value !== null ? { totalPrizeValue: Number(row.total_prize_value) } : {}),
        ...(row.net_result !== null ? { netResult: Number(row.net_result) } : {}),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        games: (gamesByBet.get(id) ?? []).map((game) => mapGame(row.lottery, game)),
      });
    }

    return ids.map((id) => byId.get(id)).filter((item): item is RealBetRecord => item !== undefined);
  }

  async findById(id: number): Promise<RealBetRecord | undefined> {
    return (await this.findMany([id]))[0];
  }

  async findByBatchId(batchId: number): Promise<RealBetRecord | undefined> {
    const result = await this.pool.query<{ id: string }>(
      "SELECT id FROM real_bets WHERE batch_id = $1 ORDER BY id DESC LIMIT 1",
      [batchId],
    );
    const row = result.rows[0];
    return row ? this.findById(Number(row.id)) : undefined;
  }

  async listRecent(lottery: LotteryId, limit = 50): Promise<RealBetRecord[]> {
    const result = await this.pool.query<{ id: string }>(
      `
        SELECT id
        FROM real_bets
        WHERE lottery = $1
        ORDER BY played_at DESC, id DESC
        LIMIT $2
      `,
      [lottery, limit],
    );
    return this.findMany(result.rows.map((row) => Number(row.id)));
  }

  async listPending(lottery?: LotteryId): Promise<RealBetRecord[]> {
    const result = await this.pool.query<{ id: string }>(
      `
        SELECT id
        FROM real_bets
        WHERE status IN ('placed', 'awaiting_result')
          AND ($1::text IS NULL OR lottery = $1)
        ORDER BY contest_number, id
      `,
      [lottery ?? null],
    );
    return this.findMany(result.rows.map((row) => Number(row.id)));
  }

  async listFinancialRevisions(realBetId: number): Promise<RealBetFinancialRevisionRecord[]> {
    const result = await this.pool.query<FinancialRevisionRow>(
      `
        SELECT
          id,
          real_bet_id,
          previous_total_prize_value::float8 AS previous_total_prize_value,
          new_total_prize_value::float8 AS new_total_prize_value,
          previous_net_result::float8 AS previous_net_result,
          new_net_result::float8 AS new_net_result,
          reason,
          created_at
        FROM real_bet_financial_revisions
        WHERE real_bet_id = $1
        ORDER BY created_at DESC, id DESC
      `,
      [realBetId],
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      realBetId: Number(row.real_bet_id),
      ...(row.previous_total_prize_value !== null ? { previousTotalPrizeValue: Number(row.previous_total_prize_value) } : {}),
      ...(row.new_total_prize_value !== null ? { newTotalPrizeValue: Number(row.new_total_prize_value) } : {}),
      ...(row.previous_net_result !== null ? { previousNetResult: Number(row.previous_net_result) } : {}),
      ...(row.new_net_result !== null ? { newNetResult: Number(row.new_net_result) } : {}),
      reason: row.reason,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async markChecked(id: number, checks: GameCheckResult[]): Promise<RealBetRecord> {
    const current = await this.findById(id);
    if (!current) throw new Error(`Real bet ${id} was not found`);
    if (checks.length !== current.games.length) {
      throw new Error("Check result count must match the real-bet game count");
    }

    const financialKnown = checks.every((check) => check.totalPrizeValue !== undefined);
    const totalPrizeValue = financialKnown
      ? checks.reduce((sum, check) => sum + check.totalPrizeValue!, 0)
      : undefined;
    const netResult = totalPrizeValue !== undefined ? totalPrizeValue - current.actualCost : undefined;
    const isOfficialFinancialRevision = current.totalPrizeValue !== undefined && (
      !sameOptionalNumber(current.totalPrizeValue, totalPrizeValue)
      || !sameOptionalNumber(current.netResult, netResult)
    );
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const [index, check] of checks.entries()) {
        const game = current.games[index]!;
        await client.query(
          `
            UPDATE real_bet_games
            SET check_result = $1::jsonb,
                prize_value = $2,
                updated_at = NOW()
            WHERE real_bet_id = $3 AND batch_position = $4
          `,
          [JSON.stringify(check), check.totalPrizeValue ?? null, id, game.batchPosition],
        );
      }
      await client.query(
        `
          UPDATE real_bets
          SET status = 'checked',
              checked_at = COALESCE(checked_at, NOW()),
              total_prize_value = $2,
              net_result = $3,
              updated_at = NOW()
          WHERE id = $1
        `,
        [id, totalPrizeValue ?? null, netResult ?? null],
      );
      if (isOfficialFinancialRevision) {
        await client.query(
          `
            INSERT INTO real_bet_financial_revisions (
              real_bet_id,
              previous_total_prize_value,
              new_total_prize_value,
              previous_net_result,
              new_net_result,
              reason
            ) VALUES ($1, $2, $3, $4, $5, 'official-prize-refresh')
          `,
          [
            id,
            current.totalPrizeValue ?? null,
            totalPrizeValue ?? null,
            current.netResult ?? null,
            netResult ?? null,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return (await this.findById(id))!;
  }

  async summary(lottery: LotteryId): Promise<RealBetSummary> {
    const result = await this.pool.query<{
      total_bets: string;
      checked_bets: string;
      financially_checked_bets: string;
      pending_bets: string;
      actual_cost: number;
      checked_cost: number;
      total_prize_value: number;
      net_result: number;
    }>(
      `
        SELECT
          COUNT(*)::text AS total_bets,
          COUNT(*) FILTER (WHERE status = 'checked')::text AS checked_bets,
          COUNT(*) FILTER (WHERE status = 'checked' AND total_prize_value IS NOT NULL)::text AS financially_checked_bets,
          COUNT(*) FILTER (WHERE status IN ('planned', 'placed', 'awaiting_result'))::text AS pending_bets,
          COALESCE(SUM(actual_cost), 0)::float8 AS actual_cost,
          COALESCE(SUM(actual_cost) FILTER (WHERE status = 'checked' AND total_prize_value IS NOT NULL), 0)::float8 AS checked_cost,
          COALESCE(SUM(total_prize_value) FILTER (WHERE status = 'checked' AND total_prize_value IS NOT NULL), 0)::float8 AS total_prize_value,
          COALESCE(SUM(net_result) FILTER (WHERE status = 'checked' AND total_prize_value IS NOT NULL), 0)::float8 AS net_result
        FROM real_bets
        WHERE lottery = $1
      `,
      [lottery],
    );
    const row = result.rows[0]!;
    const checkedCost = Number(row.checked_cost);
    const netResult = Number(row.net_result);
    return {
      lottery,
      totalBets: Number(row.total_bets),
      checkedBets: Number(row.checked_bets),
      financiallyCheckedBets: Number(row.financially_checked_bets),
      pendingBets: Number(row.pending_bets),
      actualCost: Number(row.actual_cost),
      checkedCost,
      totalPrizeValue: Number(row.total_prize_value),
      netResult,
      ...(checkedCost > 0 ? { roi: netResult / checkedCost } : {}),
    };
  }
}
