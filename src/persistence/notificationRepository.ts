import type { Pool } from "pg";
import type { LotteryId } from "../domain/types.js";

export type NotificationType =
  | "next-contest"
  | "bet-awaiting"
  | "result-available"
  | "bet-checked"
  | "bet-prize"
  | "operation-warning";
export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface NotificationRecord {
  id: number;
  eventKey: string;
  type: NotificationType;
  lottery?: LotteryId;
  severity: NotificationSeverity;
  title: string;
  body: string;
  actionHref?: string;
  metadata: Record<string, unknown>;
  readAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertNotificationInput {
  eventKey: string;
  type: NotificationType;
  lottery?: LotteryId;
  severity: NotificationSeverity;
  title: string;
  body: string;
  actionHref?: string;
  metadata?: Record<string, unknown>;
}

interface NotificationRow {
  id: string;
  event_key: string;
  type: NotificationType;
  lottery: LotteryId | null;
  severity: NotificationSeverity;
  title: string;
  body: string;
  action_href: string | null;
  metadata: Record<string, unknown>;
  read_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: NotificationRow): NotificationRecord {
  return {
    id: Number(row.id),
    eventKey: row.event_key,
    type: row.type,
    ...(row.lottery ? { lottery: row.lottery } : {}),
    severity: row.severity,
    title: row.title,
    body: row.body,
    ...(row.action_href ? { actionHref: row.action_href } : {}),
    metadata: row.metadata ?? {},
    ...(row.read_at ? { readAt: row.read_at.toISOString() } : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresNotificationRepository {
  constructor(private readonly pool: Pool) {}

  async upsert(input: UpsertNotificationInput): Promise<NotificationRecord> {
    const result = await this.pool.query<NotificationRow>(
      `
        INSERT INTO notifications (
          event_key, type, lottery, severity, title, body, action_href, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT (event_key) DO UPDATE SET
          type = EXCLUDED.type,
          lottery = EXCLUDED.lottery,
          severity = EXCLUDED.severity,
          title = EXCLUDED.title,
          body = EXCLUDED.body,
          action_href = EXCLUDED.action_href,
          metadata = EXCLUDED.metadata,
          read_at = CASE
            WHEN notifications.type <> EXCLUDED.type
              OR notifications.title <> EXCLUDED.title
              OR notifications.body <> EXCLUDED.body
            THEN NULL
            ELSE notifications.read_at
          END,
          updated_at = NOW()
        RETURNING *
      `,
      [
        input.eventKey,
        input.type,
        input.lottery ?? null,
        input.severity,
        input.title,
        input.body,
        input.actionHref ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return mapRow(result.rows[0]!);
  }

  async list(options: { limit?: number; unreadOnly?: boolean } = {}): Promise<NotificationRecord[]> {
    const limit = options.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Notification limit must be between 1 and 500");
    const result = await this.pool.query<NotificationRow>(
      `
        SELECT *
        FROM notifications
        WHERE ($1::boolean = FALSE OR read_at IS NULL)
        ORDER BY read_at IS NULL DESC, updated_at DESC, id DESC
        LIMIT $2
      `,
      [Boolean(options.unreadOnly), limit],
    );
    return result.rows.map(mapRow);
  }

  async unreadCount(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM notifications WHERE read_at IS NULL",
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async markRead(id: number): Promise<NotificationRecord | undefined> {
    const result = await this.pool.query<NotificationRow>(
      `
        UPDATE notifications
        SET read_at = COALESCE(read_at, NOW()), updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [id],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : undefined;
  }

  async markAllRead(): Promise<number> {
    const result = await this.pool.query(
      "UPDATE notifications SET read_at = NOW(), updated_at = NOW() WHERE read_at IS NULL",
    );
    return result.rowCount ?? 0;
  }
}
