import type { Pool } from "pg";
import type { GeneratedGame, LotteryId } from "../domain/types.js";
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
  pendingBets: number;
  actualCost: number;
  checkedCost: number;
  totalPrizeValue: number;
  netResult: number;
  roi?: number;
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
  batch_position: number;
  numbers: number[];
  fixed_numbers: number[];
  variable_numbers: number[];
  lucky_month: string | null;
  metadata: GeneratedGame["metadata"];
  check_result: GameCheckResult | null;
  prize_value: number | null;
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
      throw error;
    } finally {
      client.release();
    }

    const saved = await this.findById(id);
    if (!saved) throw new Error("Real bet was not found after insert");
    return saved;
  }

  async findById(id: number): Promise<RealBetRecord | undefined> {
    const result = await this.pool.query<BetRow>(
      `
        SELECT
          id, batch_id, lottery, contest_number, status,
          actual_cost::float8 AS actual_cost,
          played_at, checked_at,
          total_prize_value::float8 AS total_prize_value,
          net_result::float8 AS net_result,
          created_at, updated_at
        FROM real_bets
        WHERE id = $1
      `,
      [id],
    );
    const row = result.rows[0];
    if (!row) return undefined;

    const games = await this.pool.query<BetGameRow>(
      `
        SELECT
          batch_position, numbers, fixed_numbers, variable_numbers, lucky_month, metadata,
          check_result, prize_value::float8 AS prize_value
        FROM real_bet_games
        WHERE real_bet_id = $1
        ORDER BY batch_position
      `,
      [id],
    );

    return {
      id: Number(row.id),
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
      games: games.rows.map((game) => mapGame(row.lottery, game)),
    };
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
    const items = await Promise.all(result.rows.map((row) => this.findById(Number(row.id))));
    return items.filter((item): item is RealBetRecord => item !== undefined);
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
    const items = await Promise.all(result.rows.map((row) => this.findById(Number(row.id))));
    return items.filter((item): item is RealBetRecord => item !== undefined);
  }

  async markChecked(id: number, checks: GameCheckResult[]): Promise<RealBetRecord> {
    const current = await this.findById(id);
    if (!current) throw new Error(`Real bet ${id} was not found`);
    if (checks.length !== current.games.length) {
      throw new Error("Check result count must match the real-bet game count");
    }

    const totalPrizeValue = checks.reduce((sum, check) => sum + (check.totalPrizeValue ?? 0), 0);
    const netResult = totalPrizeValue - current.actualCost;
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
          [JSON.stringify(check), check.totalPrizeValue ?? 0, id, game.batchPosition],
        );
      }
      await client.query(
        `
          UPDATE real_bets
          SET status = 'checked',
              checked_at = NOW(),
              total_prize_value = $2,
              net_result = $3,
              updated_at = NOW()
          WHERE id = $1
        `,
        [id, totalPrizeValue, netResult],
      );
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
          COUNT(*) FILTER (WHERE status IN ('planned', 'placed', 'awaiting_result'))::text AS pending_bets,
          COALESCE(SUM(actual_cost), 0)::float8 AS actual_cost,
          COALESCE(SUM(actual_cost) FILTER (WHERE status = 'checked'), 0)::float8 AS checked_cost,
          COALESCE(SUM(total_prize_value) FILTER (WHERE status = 'checked'), 0)::float8 AS total_prize_value,
          COALESCE(SUM(net_result) FILTER (WHERE status = 'checked'), 0)::float8 AS net_result
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
      pendingBets: Number(row.pending_bets),
      actualCost: Number(row.actual_cost),
      checkedCost,
      totalPrizeValue: Number(row.total_prize_value),
      netResult,
      ...(checkedCost > 0 ? { roi: netResult / checkedCost } : {}),
    };
  }
}
