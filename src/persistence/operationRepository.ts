import type { Pool } from "pg";

export type OperationName = "sync-all";
export type OperationStatus = "running" | "success" | "partial" | "failed" | "abandoned";

export interface OperationRunRecord<TDetails = unknown> {
  id: number;
  operation: OperationName;
  status: OperationStatus;
  details: TDetails;
  startedAt: string;
  finishedAt?: string;
}

interface OperationRunRow {
  id: string;
  operation: OperationName;
  status: OperationStatus;
  details: unknown;
  started_at: Date;
  finished_at: Date | null;
}

function mapRun<TDetails>(row: OperationRunRow): OperationRunRecord<TDetails> {
  return {
    id: Number(row.id),
    operation: row.operation,
    status: row.status,
    details: row.details as TDetails,
    startedAt: row.started_at.toISOString(),
    ...(row.finished_at ? { finishedAt: row.finished_at.toISOString() } : {}),
  };
}

export class PostgresOperationRepository {
  constructor(private readonly pool: Pool) {}

  async create(operation: OperationName): Promise<OperationRunRecord<Record<string, never>>> {
    const result = await this.pool.query<OperationRunRow>(
      `
        INSERT INTO operation_runs (operation, status)
        VALUES ($1, 'running')
        RETURNING id, operation, status, details, started_at, finished_at
      `,
      [operation],
    );
    return mapRun<Record<string, never>>(result.rows[0]!);
  }

  async finish<TDetails>(
    id: number,
    status: "success" | "partial" | "failed",
    details: TDetails,
  ): Promise<OperationRunRecord<TDetails>> {
    const result = await this.pool.query<OperationRunRow>(
      `
        UPDATE operation_runs
        SET status = $2, details = $3::jsonb, finished_at = NOW()
        WHERE id = $1
        RETURNING id, operation, status, details, started_at, finished_at
      `,
      [id, status, JSON.stringify(details)],
    );
    if (!result.rows[0]) throw new Error(`Operation run ${id} was not found`);
    return mapRun<TDetails>(result.rows[0]);
  }

  async recoverRunning(): Promise<number> {
    const result = await this.pool.query(
      `
        UPDATE operation_runs
        SET status = 'abandoned', finished_at = NOW()
        WHERE status = 'running' AND finished_at IS NULL
      `,
    );
    return result.rowCount ?? 0;
  }

  async latest<TDetails>(operation: OperationName): Promise<OperationRunRecord<TDetails> | undefined> {
    const result = await this.pool.query<OperationRunRow>(
      `
        SELECT id, operation, status, details, started_at, finished_at
        FROM operation_runs
        WHERE operation = $1
        ORDER BY started_at DESC
        LIMIT 1
      `,
      [operation],
    );
    return result.rows[0] ? mapRun<TDetails>(result.rows[0]) : undefined;
  }
}
