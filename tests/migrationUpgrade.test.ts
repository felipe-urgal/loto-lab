import test from "node:test";
import assert from "node:assert/strict";
import { appendFile, copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "../src/db/migrations.js";
import { PostgresStrategyRepository } from "../src/persistence/strategyRepository.js";
import { createIsolatedPostgresDatabase } from "./helpers/postgres.js";

const databaseUrl = process.env.DATABASE_URL;

const LEGACY_MIGRATIONS = [
  "001_initial.sql",
  "002_real_bets.sql",
  "003_game_batch_lifecycle.sql",
  "004_ai_insights.sql",
  "005_operation_runs.sql",
  "006_agenda_notifications.sql",
  "007_data_integrity_hardening.sql",
  "008_reliability_async_strategies.sql",
  "009_generator_previews.sql",
  "010_reliability_hardening.sql",
  "011_real_bet_financial_revisions.sql",
] as const;

test(
  "migrations upgrade an existing 001-011 database to 012 without data loss and keep checksum drift fatal",
  { skip: !databaseUrl },
  async (t) => {
    const database = await createIsolatedPostgresDatabase({
      label: "migration-upgrade",
      max: 4,
      migrate: false,
    });
    const { pool } = database;
    const legacyDir = await mkdtemp(join(tmpdir(), "loto-lab-migrations-"));

    t.after(async () => {
      await rm(legacyDir, { recursive: true, force: true });
      await database.close();
    });

    for (const file of LEGACY_MIGRATIONS) {
      await copyFile(join("db/migrations", file), join(legacyDir, file));
    }

    const baseline = await runMigrations(pool, legacyDir);
    assert.deepEqual(baseline.applied, [...LEGACY_MIGRATIONS]);
    assert.deepEqual(baseline.skipped, []);

    const strategies = new PostgresStrategyRepository(pool);
    const strategy = await strategies.upsert({
      slug: "upgrade-contract",
      lottery: "mega-sena",
      name: "Upgrade Contract",
      methodologyVersion: "legacy-v1",
      config: { fixedCount: 3, source: "001-011" },
    });

    const batch = await pool.query<{ id: string }>(
      `
        INSERT INTO generated_game_batches (
          lottery, strategy_id, strategy_version_id, target_contest_number, generator_options
        ) VALUES ($1, $2, $3, $4, $5::jsonb)
        RETURNING id
      `,
      [
        "mega-sena",
        strategy.id,
        strategy.latestVersionId,
        990_001,
        JSON.stringify({ source: "legacy-upgrade-test" }),
      ],
    );
    const batchId = Number(batch.rows[0]!.id);

    const beforeChecksums = await pool.query<{ name: string; checksum_sha256: string }>(
      "SELECT name, checksum_sha256 FROM schema_migrations ORDER BY name",
    );
    assert.equal(beforeChecksums.rows.length, LEGACY_MIGRATIONS.length);
    assert.ok(beforeChecksums.rows.every((row) => row.checksum_sha256.length === 64));

    const upgrade = await runMigrations(pool);
    assert.deepEqual(upgrade.applied, ["012_domain_contract_alignment.sql"]);
    assert.deepEqual(upgrade.skipped, [...LEGACY_MIGRATIONS]);

    const preservedStrategy = await strategies.findById(strategy.id);
    assert.equal(preservedStrategy?.lottery, "mega-sena");
    assert.equal(preservedStrategy?.latestVersionId, strategy.latestVersionId);
    assert.deepEqual(preservedStrategy?.config, { fixedCount: 3, source: "001-011" });

    const preservedBatch = await pool.query<{
      strategy_id: string;
      strategy_version_id: string;
      target_contest_number: number;
      generator_options: Record<string, unknown>;
    }>(
      `
        SELECT strategy_id, strategy_version_id, target_contest_number, generator_options
        FROM generated_game_batches
        WHERE id = $1
      `,
      [batchId],
    );
    assert.equal(Number(preservedBatch.rows[0]?.strategy_id), strategy.id);
    assert.equal(Number(preservedBatch.rows[0]?.strategy_version_id), strategy.latestVersionId);
    assert.equal(preservedBatch.rows[0]?.target_contest_number, 990_001);
    assert.deepEqual(preservedBatch.rows[0]?.generator_options, { source: "legacy-upgrade-test" });

    await assert.rejects(
      () => pool.query(
        "UPDATE strategies SET lottery = 'lotofacil' WHERE id = $1",
        [strategy.id],
      ),
      /Strategy lottery is immutable/,
    );
    await assert.rejects(
      () => pool.query(
        "UPDATE strategy_versions SET methodology_version = 'mutated' WHERE id = $1",
        [strategy.latestVersionId],
      ),
      /Strategy versions are immutable/,
    );
    await assert.rejects(
      () => pool.query(
        "DELETE FROM strategy_versions WHERE id = $1",
        [strategy.latestVersionId],
      ),
      /Strategy versions are immutable/,
    );

    const preservedVersion = await strategies.findVersionById(strategy.latestVersionId);
    assert.equal(preservedVersion?.id, strategy.latestVersionId);
    assert.equal(preservedVersion?.methodologyVersion, "legacy-v1");

    const idempotent = await runMigrations(pool);
    assert.deepEqual(idempotent.applied, []);
    assert.ok(idempotent.skipped.includes("001_initial.sql"));
    assert.ok(idempotent.skipped.includes("012_domain_contract_alignment.sql"));

    const afterChecksums = await pool.query<{ name: string; checksum_sha256: string }>(
      "SELECT name, checksum_sha256 FROM schema_migrations WHERE name <> '012_domain_contract_alignment.sql' ORDER BY name",
    );
    assert.deepEqual(afterChecksums.rows, beforeChecksums.rows);

    await appendFile(join(legacyDir, "001_initial.sql"), "\n-- synthetic drift for contract test\n", "utf8");
    await assert.rejects(
      () => runMigrations(pool, legacyDir),
      /Migration drift detected for 001_initial\.sql/,
    );
  },
);
