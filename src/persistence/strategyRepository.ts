import type { Pool } from "pg";
import type { LotteryId } from "../domain/types.js";
import type { StrategyRecord, UpsertStrategyInput } from "./types.js";

interface StrategyRow {
  id: string;
  slug: string;
  lottery: LotteryId;
  name: string;
  methodology_version: string;
  config: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

function mapStrategy(row: StrategyRow): StrategyRecord {
  return {
    id: Number(row.id),
    slug: row.slug,
    lottery: row.lottery,
    name: row.name,
    methodologyVersion: row.methodology_version,
    config: row.config,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresStrategyRepository {
  constructor(private readonly pool: Pool) {}

  async upsert(input: UpsertStrategyInput): Promise<StrategyRecord> {
    const result = await this.pool.query<StrategyRow>(
      `
        INSERT INTO strategies (
          slug, lottery, name, methodology_version, config
        ) VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (slug) DO UPDATE SET
          lottery = EXCLUDED.lottery,
          name = EXCLUDED.name,
          methodology_version = EXCLUDED.methodology_version,
          config = EXCLUDED.config,
          updated_at = NOW()
        RETURNING *
      `,
      [
        input.slug,
        input.lottery,
        input.name,
        input.methodologyVersion,
        JSON.stringify(input.config ?? {}),
      ],
    );

    return mapStrategy(result.rows[0]!);
  }

  async findBySlug(slug: string): Promise<StrategyRecord | undefined> {
    const result = await this.pool.query<StrategyRow>(
      "SELECT * FROM strategies WHERE slug = $1",
      [slug],
    );
    return result.rows[0] ? mapStrategy(result.rows[0]) : undefined;
  }

  async list(lottery?: LotteryId): Promise<StrategyRecord[]> {
    const result = lottery
      ? await this.pool.query<StrategyRow>(
          "SELECT * FROM strategies WHERE lottery = $1 ORDER BY slug",
          [lottery],
        )
      : await this.pool.query<StrategyRow>("SELECT * FROM strategies ORDER BY lottery, slug");

    return result.rows.map(mapStrategy);
  }
}
