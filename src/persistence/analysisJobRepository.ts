import type { Pool } from "pg";
import type { LotteryId } from "../domain/types.js";

export type AnalysisJobKind = "backtest" | "strategy-lab";
export type AnalysisJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface AnalysisJobRecord {
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

interface AnalysisJobRow {
  id: string;
  kind: AnalysisJobKind;
  lottery: LotteryId;
  status: AnalysisJobStatus;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: { code?: string; message: string } | null;
  cancel_requested: boolean;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

function mapRow(row: AnalysisJobRow): AnalysisJobRecord {
  return {
    id: Number(row.id),
    kind: row.kind,
    lottery: row.lottery,
    status: row.status,
    input: row.input,
    ...(row.result ? { result: row.result } : {}),
    ...(row.error ? { error: row.error } : {}),
    cancelRequested: row.cancel_requested,
    createdAt: row.created_at.toISOString(),
    ...(row.started_at ? { startedAt: row.started_at.toISOString() } : {}),
    ...(row.finished_at ? { finishedAt: row.finished_at.toISOString() } : {}),
  };
}

const SELECT_COLUMNS = `
  id, kind, lottery, status, input, result, error, cancel_requested,
  created_at, started_at, finished_at
`;

export class PostgresAnalysisJobRepository {
  constructor(private readonly pool: Pool) {}

  async create(kind: AnalysisJobKind, lottery: LotteryId, input: Record<string, unknown>): Promise<AnalysisJobRecord> {
    const result = await this.pool.query<AnalysisJobRow>(
      `
        INSERT INTO analysis_jobs (kind, lottery, input)
        VALUES ($1, $2, $3::jsonb)
        RETURNING ${SELECT_COLUMNS}
      `,
      [kind, lottery, JSON.stringify(input)],
    );
    return mapRow(result.rows[0]!);
  }

  async findById(id: number): Promise<AnalysisJobRecord | undefined> {
    const result = await this.pool.query<AnalysisJobRow>(
      `SELECT ${SELECT_COLUMNS} FROM analysis_jobs WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async list(limit = 50, lottery?: LotteryId): Promise<AnalysisJobRecord[]> {
    const result = await this.pool.query<AnalysisJobRow>(
      `
        SELECT ${SELECT_COLUMNS}
        FROM analysis_jobs
        WHERE ($2::text IS NULL OR lottery = $2)
        ORDER BY created_at DESC, id DESC
        LIMIT $1
      `,
      [limit, lottery ?? null],
    );
    return result.rows.map(mapRow);
  }

  async latestCompleted(kind: AnalysisJobKind, lottery: LotteryId): Promise<AnalysisJobRecord | undefined> {
    const result = await this.pool.query<AnalysisJobRow>(
      `
        SELECT ${SELECT_COLUMNS}
        FROM analysis_jobs
        WHERE kind = $1
          AND lottery = $2
          AND status = 'completed'
          AND result IS NOT NULL
        ORDER BY finished_at DESC NULLS LAST, id DESC
        LIMIT 1
      `,
      [kind, lottery],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async recoverRunning(): Promise<number> {
    const result = await this.pool.query(
      `
        UPDATE analysis_jobs
        SET status = CASE WHEN cancel_requested THEN 'cancelled' ELSE 'queued' END,
            started_at = CASE WHEN cancel_requested THEN started_at ELSE NULL END,
            finished_at = CASE WHEN cancel_requested THEN NOW() ELSE NULL END,
            error = CASE
              WHEN cancel_requested THEN jsonb_build_object('message', 'Cancellation completed after process restart')
              ELSE jsonb_build_object('message', 'Job recovered after process restart')
            END
        WHERE status = 'running'
      `,
    );
    return result.rowCount ?? 0;
  }

  async claimNext(): Promise<AnalysisJobRecord | undefined> {
    const result = await this.pool.query<AnalysisJobRow>(
      `
        UPDATE analysis_jobs job
        SET status = 'running', started_at = NOW(), error = NULL
        WHERE job.id = (
          SELECT queued.id
          FROM analysis_jobs queued
          WHERE queued.status = 'queued' AND queued.cancel_requested = FALSE
          ORDER BY queued.created_at, queued.id
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING ${SELECT_COLUMNS}
      `,
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async complete(id: number, resultPayload: Record<string, unknown>): Promise<AnalysisJobRecord> {
    const result = await this.pool.query<AnalysisJobRow>(
      `
        UPDATE analysis_jobs
        SET status = 'completed', result = $2::jsonb, error = NULL, finished_at = NOW()
        WHERE id = $1 AND status = 'running'
        RETURNING ${SELECT_COLUMNS}
      `,
      [id, JSON.stringify(resultPayload)],
    );
    if (!result.rows[0]) throw new Error(`Analysis job ${id} is not running`);
    return mapRow(result.rows[0]);
  }

  async fail(id: number, error: { code?: string; message: string }): Promise<AnalysisJobRecord> {
    const result = await this.pool.query<AnalysisJobRow>(
      `
        UPDATE analysis_jobs
        SET status = 'failed', error = $2::jsonb, finished_at = NOW()
        WHERE id = $1 AND status = 'running'
        RETURNING ${SELECT_COLUMNS}
      `,
      [id, JSON.stringify(error)],
    );
    if (!result.rows[0]) throw new Error(`Analysis job ${id} is not running`);
    return mapRow(result.rows[0]);
  }

  async cancel(id: number): Promise<AnalysisJobRecord | undefined> {
    const result = await this.pool.query<AnalysisJobRow>(
      `
        UPDATE analysis_jobs
        SET cancel_requested = TRUE,
            status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END,
            finished_at = CASE WHEN status = 'queued' THEN NOW() ELSE finished_at END
        WHERE id = $1 AND status IN ('queued', 'running')
        RETURNING ${SELECT_COLUMNS}
      `,
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : this.findById(id);
  }

  async markCancelled(id: number): Promise<AnalysisJobRecord> {
    const result = await this.pool.query<AnalysisJobRow>(
      `
        UPDATE analysis_jobs
        SET status = 'cancelled', cancel_requested = TRUE, finished_at = NOW()
        WHERE id = $1 AND status = 'running'
        RETURNING ${SELECT_COLUMNS}
      `,
      [id],
    );
    if (!result.rows[0]) throw new Error(`Analysis job ${id} is not running`);
    return mapRow(result.rows[0]);
  }
}
