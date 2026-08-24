import { createHash } from "node:crypto";
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

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
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
        checksum_sha256 TEXT,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query("ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT");

    const files = (await readdir(migrationsDir))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort((a, b) => a.localeCompare(b));

    for (const file of files) {
      const sql = await readFile(join(migrationsDir, file), "utf8");
      const currentChecksum = checksum(sql);
      const existing = await client.query<{ checksum_sha256: string | null }>(
        "SELECT checksum_sha256 FROM schema_migrations WHERE name = $1",
        [file],
      );
      const row = existing.rows[0];
      if (row) {
        // First deployment after checksum support establishes the baseline for
        // previously applied immutable migrations. Every later drift is fatal.
        if (row.checksum_sha256 === null) {
          await client.query(
            "UPDATE schema_migrations SET checksum_sha256 = $2 WHERE name = $1 AND checksum_sha256 IS NULL",
            [file, currentChecksum],
          );
        } else if (row.checksum_sha256 !== currentChecksum) {
          throw new Error(
            `Migration drift detected for ${file}: applied checksum ${row.checksum_sha256} differs from repository checksum ${currentChecksum}`,
          );
        }
        skipped.push(file);
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations(name, checksum_sha256) VALUES ($1, $2)",
          [file, currentChecksum],
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
