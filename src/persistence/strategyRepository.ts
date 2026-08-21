import type { Pool, PoolClient } from "pg";
import type { LotteryId } from "../domain/types.js";
import type {
  StrategyRecord,
  StrategyVersionRecord,
  UpsertStrategyInput,
} from "./types.js";

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

interface VersionRow {
  id: string;
  strategy_id: string;
  version: number;
  methodology_version: string;
  config: Record<string, unknown>;
  created_at: Date;
}

function mapVersion(row: VersionRow): StrategyVersionRecord {
  return {
    id: Number(row.id),
    strategyId: Number(row.strategy_id),
    version: row.version,
    methodologyVersion: row.methodology_version,
    config: row.config,
    createdAt: row.created_at.toISOString(),
  };
}

async function latestVersion(client: Pick<Pool, "query"> | PoolClient, strategyId: number): Promise<StrategyVersionRecord | undefined> {
  const result = await client.query<VersionRow>(
    `
      SELECT id, strategy_id, version, methodology_version, config, created_at
      FROM strategy_versions
      WHERE strategy_id = $1
      ORDER BY version DESC
      LIMIT 1
    `,
    [strategyId],
  );
  return result.rows[0] ? mapVersion(result.rows[0]) : undefined;
}

async function mapStrategy(client: Pick<Pool, "query"> | PoolClient, row: StrategyRow): Promise<StrategyRecord> {
  const version = await latestVersion(client, Number(row.id));
  if (!version) throw new Error(`Strategy ${row.id} has no immutable version`);
  return {
    id: Number(row.id),
    slug: row.slug,
    lottery: row.lottery,
    name: row.name,
    methodologyVersion: version.methodologyVersion,
    config: version.config,
    latestVersionId: version.id,
    version: version.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresStrategyRepository {
  constructor(private readonly pool: Pool) {}

  async upsert(input: UpsertStrategyInput): Promise<StrategyRecord> {
    const client = await this.pool.connect();
    let strategyId = 0;
    try {
      await client.query("BEGIN");
      const existing = await client.query<StrategyRow>(
        "SELECT * FROM strategies WHERE slug = $1 FOR UPDATE",
        [input.slug],
      );
      const current = existing.rows[0];
      const config = input.config ?? {};

      if (!current) {
        const inserted = await client.query<StrategyRow>(
          `
            INSERT INTO strategies (slug, lottery, name, methodology_version, config)
            VALUES ($1, $2, $3, $4, $5::jsonb)
            RETURNING *
          `,
          [input.slug, input.lottery, input.name, input.methodologyVersion, JSON.stringify(config)],
        );
        strategyId = Number(inserted.rows[0]!.id);
        await client.query(
          `
            INSERT INTO strategy_versions (strategy_id, version, methodology_version, config)
            VALUES ($1, 1, $2, $3::jsonb)
          `,
          [strategyId, input.methodologyVersion, JSON.stringify(config)],
        );
      } else {
        strategyId = Number(current.id);
        if (current.lottery !== input.lottery) {
          throw new Error(`STRATEGY_LOTTERY_IMMUTABLE:${input.slug}`);
        }

        const sameVersion = await client.query(
          `
            SELECT 1
            FROM (
              SELECT methodology_version, config
              FROM strategy_versions
              WHERE strategy_id = $1
              ORDER BY version DESC
              LIMIT 1
            ) latest
            WHERE latest.methodology_version = $2
              AND latest.config = $3::jsonb
          `,
          [strategyId, input.methodologyVersion, JSON.stringify(config)],
        );

        if (!sameVersion.rowCount) {
          await client.query(
            `
              INSERT INTO strategy_versions (strategy_id, version, methodology_version, config)
              SELECT $1, COALESCE(MAX(version), 0) + 1, $2, $3::jsonb
              FROM strategy_versions
              WHERE strategy_id = $1
            `,
            [strategyId, input.methodologyVersion, JSON.stringify(config)],
          );
        }

        await client.query(
          `
            UPDATE strategies
            SET name = $2,
                methodology_version = $3,
                config = $4::jsonb,
                updated_at = NOW()
            WHERE id = $1
          `,
          [strategyId, input.name, input.methodologyVersion, JSON.stringify(config)],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const saved = await this.findById(strategyId);
    if (!saved) throw new Error("Strategy was not found after upsert");
    return saved;
  }

  async findById(id: number): Promise<StrategyRecord | undefined> {
    const result = await this.pool.query<StrategyRow>("SELECT * FROM strategies WHERE id = $1", [id]);
    return result.rows[0] ? mapStrategy(this.pool, result.rows[0]) : undefined;
  }

  async findBySlug(slug: string): Promise<StrategyRecord | undefined> {
    const result = await this.pool.query<StrategyRow>("SELECT * FROM strategies WHERE slug = $1", [slug]);
    return result.rows[0] ? mapStrategy(this.pool, result.rows[0]) : undefined;
  }

  async findVersionById(id: number): Promise<StrategyVersionRecord | undefined> {
    const result = await this.pool.query<VersionRow>(
      `
        SELECT id, strategy_id, version, methodology_version, config, created_at
        FROM strategy_versions
        WHERE id = $1
      `,
      [id],
    );
    return result.rows[0] ? mapVersion(result.rows[0]) : undefined;
  }

  async listVersions(strategyId: number): Promise<StrategyVersionRecord[]> {
    const result = await this.pool.query<VersionRow>(
      `
        SELECT id, strategy_id, version, methodology_version, config, created_at
        FROM strategy_versions
        WHERE strategy_id = $1
        ORDER BY version DESC
      `,
      [strategyId],
    );
    return result.rows.map(mapVersion);
  }

  async list(lottery?: LotteryId): Promise<StrategyRecord[]> {
    const result = lottery
      ? await this.pool.query<StrategyRow>("SELECT * FROM strategies WHERE lottery = $1 ORDER BY slug", [lottery])
      : await this.pool.query<StrategyRow>("SELECT * FROM strategies ORDER BY lottery, slug");
    return Promise.all(result.rows.map((row) => mapStrategy(this.pool, row)));
  }
}
