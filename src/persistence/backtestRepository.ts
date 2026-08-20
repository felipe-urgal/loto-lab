import type { Pool } from "pg";
import type { LotteryId } from "../domain/types.js";
import type {
  BacktestRoundArtifact,
  BacktestRunRecord,
  SaveBacktestRunInput,
} from "./types.js";

interface BacktestRunRow {
  id: string;
  lottery: LotteryId;
  strategy_id: string | null;
  options: Record<string, unknown>;
  summary: Record<string, unknown>;
  created_at: Date;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

export class PostgresBacktestRepository {
  constructor(private readonly pool: Pool) {}

  async save(input: SaveBacktestRunInput): Promise<BacktestRunRecord> {
    const client = await this.pool.connect();
    let runId = 0;

    try {
      await client.query("BEGIN");
      const run = await client.query<{ id: string }>(
        `
          INSERT INTO backtest_runs (
            lottery,
            strategy_id,
            options,
            summary,
            tested_contests,
            total_games,
            total_cost,
            financial_cost,
            total_prize_value,
            roi,
            financial_coverage
          ) VALUES (
            $1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9, $10, $11
          )
          RETURNING id
        `,
        [
          input.lottery,
          input.strategyId ?? null,
          JSON.stringify(input.options ?? {}),
          JSON.stringify(input.summary),
          nonNegativeInt(input.summary.testedContests),
          nonNegativeInt(input.summary.totalGames),
          finiteNumber(input.summary.totalCost),
          finiteNumber(input.summary.financialCost),
          finiteNumber(input.summary.totalPrizeValue),
          finiteNumber(input.summary.roi),
          finiteNumber(input.summary.financialCoverage),
        ],
      );
      runId = Number(run.rows[0]!.id);

      for (const round of input.rounds) {
        if (!Number.isInteger(round.contest) || round.contest < 1) {
          throw new Error("Every persisted backtest round must have a positive contest number");
        }
        await client.query(
          `
            INSERT INTO backtest_rounds (
              backtest_run_id, contest_number, payload
            ) VALUES ($1, $2, $3::jsonb)
          `,
          [runId, round.contest, JSON.stringify(round)],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const saved = await this.findById(runId);
    if (!saved) throw new Error("Backtest run was not found after insert");
    return saved;
  }

  async findById(id: number): Promise<BacktestRunRecord | undefined> {
    const runResult = await this.pool.query<BacktestRunRow>(
      `
        SELECT id, lottery, strategy_id, options, summary, created_at
        FROM backtest_runs
        WHERE id = $1
      `,
      [id],
    );
    const run = runResult.rows[0];
    if (!run) return undefined;

    const roundsResult = await this.pool.query<{ payload: BacktestRoundArtifact }>(
      `
        SELECT payload
        FROM backtest_rounds
        WHERE backtest_run_id = $1
        ORDER BY contest_number
      `,
      [id],
    );

    return {
      id: Number(run.id),
      lottery: run.lottery,
      ...(run.strategy_id ? { strategyId: Number(run.strategy_id) } : {}),
      options: run.options,
      summary: run.summary,
      rounds: roundsResult.rows.map((row) => row.payload),
      createdAt: run.created_at.toISOString(),
    };
  }

  async listRecent(lottery: LotteryId, limit = 20): Promise<BacktestRunRecord[]> {
    const result = await this.pool.query<{ id: string }>(
      `
        SELECT id
        FROM backtest_runs
        WHERE lottery = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2
      `,
      [lottery, limit],
    );

    const runs = await Promise.all(result.rows.map((row) => this.findById(Number(row.id))));
    return runs.filter((run): run is BacktestRunRecord => run !== undefined);
  }
}
