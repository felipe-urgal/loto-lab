import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { createPostgresPool } from "../../src/db/client.js";
import { runMigrations } from "../../src/db/migrations.js";

export interface IsolatedPostgresDatabase {
  databaseName: string;
  connectionString: string;
  pool: Pool;
  close(): Promise<void>;
}

export interface IsolatedPostgresOptions {
  label?: string;
  max?: number;
  migrate?: boolean;
}

function testDatabaseName(label: string | undefined): string {
  const normalized = (label ?? "suite")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24) || "suite";
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  return `loto_test_${normalized}_${process.pid}_${suffix}`.slice(0, 63);
}

function databaseConnectionString(baseConnectionString: string, databaseName: string): string {
  const url = new URL(baseConnectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function dropDatabase(
  baseConnectionString: string,
  databaseName: string,
  force: boolean,
): Promise<void> {
  const admin = createPostgresPool({ connectionString: baseConnectionString, max: 1 });
  try {
    await admin.query(
      `DROP DATABASE IF EXISTS "${databaseName}"${force ? " WITH (FORCE)" : ""}`,
    );
  } finally {
    await admin.end();
  }
}

export async function createIsolatedPostgresDatabase(
  options: IsolatedPostgresOptions = {},
): Promise<IsolatedPostgresDatabase> {
  const baseConnectionString = process.env.DATABASE_URL;
  if (!baseConnectionString) {
    throw new Error("DATABASE_URL is required to create an isolated PostgreSQL test database");
  }

  const databaseName = testDatabaseName(options.label);
  const connectionString = databaseConnectionString(baseConnectionString, databaseName);
  const admin = createPostgresPool({ connectionString: baseConnectionString, max: 1 });
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end();
  }

  const pool = createPostgresPool({ connectionString, max: options.max });
  try {
    if (options.migrate ?? true) await runMigrations(pool);
  } catch (error) {
    await pool.end().catch(() => undefined);
    await dropDatabase(baseConnectionString, databaseName, true).catch(() => undefined);
    throw error;
  }

  let closed = false;
  return {
    databaseName,
    connectionString,
    pool,
    async close() {
      if (closed) return;
      closed = true;
      await pool.end();
      try {
        await dropDatabase(baseConnectionString, databaseName, false);
      } catch (error) {
        await dropDatabase(baseConnectionString, databaseName, true).catch(() => undefined);
        throw error;
      }
    },
  };
}
