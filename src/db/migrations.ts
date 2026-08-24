import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool, PoolClient } from "pg";

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

const MIGRATION_LOCK_WAIT_MS = 15_000;
const MIGRATION_LOCK_RETRY_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireMigrationLock(client: PoolClient): Promise<void> {
  const deadline = Date.now() + MIGRATION_LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext('loto_lab_migrations')) AS locked",
    );
    if (result.rows[0]?.locked) return;
    await delay(MIGRATION_LOCK_RETRY_MS);
  }
  throw new Error(`Timed out after ${MIGRATION_LOCK_WAIT_MS}ms waiting for the migration advisory lock`);
}

export async function runMigrations(
  pool: Pool,
  migrationsDir = "db/migrations",
): Promise<MigrationResult> {
  const client = await pool.connect();
  const applied: string[] = [];
  const skipped: string[] = [];
  let lockAcquired = false;

  try {
    await acquireMigrationLock(client);
    lockAcquired = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = (await readdir(migrationsDir))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort((a, b) => a.localeCompare(b));

    for (const file of files) {
      const existing = await client.query(
        "SELECT 1 FROM schema_migrations WHERE name = $1",
        [file],
      );
      if (existing.rowCount) {
        skipped.push(file);
        continue;
      }

      const sql = await readFile(join(migrationsDir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations(name) VALUES ($1)",
          [file],
        );
        await client.query("COMMIT");
        applied.push(file);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    return { applied, skipped };
  } finally {
    if (lockAcquired) {
      await client.query("SELECT pg_advisory_unlock(hashtext('loto_lab_migrations'))").catch(() => undefined);
    }
    client.release();
  }
}
