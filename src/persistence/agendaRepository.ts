import type { Pool } from "pg";
import type { LotteryId } from "../domain/types.js";
import type { LotteryAgendaSnapshot } from "../data/source.js";

export interface LotteryAgendaRecord extends LotteryAgendaSnapshot {
  updatedAt: string;
}

interface AgendaRow {
  lottery: LotteryId;
  current_contest: number;
  next_contest: number;
  next_draw_date: string | null;
  estimated_prize: number | null;
  accumulated: boolean;
  updated_at: Date;
}

function mapRow(row: AgendaRow): LotteryAgendaRecord {
  return {
    lottery: row.lottery,
    currentContest: row.current_contest,
    nextContest: row.next_contest,
    ...(row.next_draw_date ? { nextDrawDate: row.next_draw_date } : {}),
    ...(row.estimated_prize !== null ? { estimatedPrize: Number(row.estimated_prize) } : {}),
    accumulated: row.accumulated,
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresAgendaRepository {
  constructor(private readonly pool: Pool) {}

  async upsert(snapshot: LotteryAgendaSnapshot): Promise<LotteryAgendaRecord> {
    const result = await this.pool.query<AgendaRow>(
      `
        INSERT INTO lottery_agenda (
          lottery, current_contest, next_contest, next_draw_date,
          estimated_prize, accumulated, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (lottery) DO UPDATE SET
          current_contest = EXCLUDED.current_contest,
          next_contest = EXCLUDED.next_contest,
          next_draw_date = EXCLUDED.next_draw_date,
          estimated_prize = EXCLUDED.estimated_prize,
          accumulated = EXCLUDED.accumulated,
          updated_at = NOW()
        RETURNING
          lottery, current_contest, next_contest, next_draw_date::text,
          estimated_prize::float8 AS estimated_prize, accumulated, updated_at
      `,
      [
        snapshot.lottery,
        snapshot.currentContest,
        snapshot.nextContest,
        snapshot.nextDrawDate ?? null,
        snapshot.estimatedPrize ?? null,
        snapshot.accumulated,
      ],
    );
    return mapRow(result.rows[0]!);
  }

  async list(): Promise<LotteryAgendaRecord[]> {
    const result = await this.pool.query<AgendaRow>(`
      SELECT
        lottery, current_contest, next_contest, next_draw_date::text,
        estimated_prize::float8 AS estimated_prize, accumulated, updated_at
      FROM lottery_agenda
      ORDER BY CASE lottery
        WHEN 'mega-sena' THEN 1
        WHEN 'lotofacil' THEN 2
        ELSE 3
      END
    `);
    return result.rows.map(mapRow);
  }
}
