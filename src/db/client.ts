import { Pool, type PoolConfig } from "pg";

export interface PostgresPoolOptions {
  connectionString?: string;
  max?: number;
}

function optionalPositiveInt(value: string | undefined, field: string, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${field} must be a positive integer`);
  }
  return parsed;
}

export function buildPostgresPoolConfig(options: PostgresPoolOptions = {}): PoolConfig {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  const max = options.max ?? 10;
  const common: PoolConfig = {
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "loto-lab",
  };

  if (connectionString) {
    return { ...common, connectionString };
  }

  const host = process.env.DATABASE_HOST;
  const database = process.env.DATABASE_NAME;
  const user = process.env.DATABASE_USER;
  const password = process.env.DATABASE_PASSWORD;

  if (!host || !database || !user || password === undefined) {
    throw new Error(
      "PostgreSQL configuration requires DATABASE_URL or DATABASE_HOST, DATABASE_NAME, DATABASE_USER and DATABASE_PASSWORD",
    );
  }

  return {
    ...common,
    host,
    port: optionalPositiveInt(process.env.DATABASE_PORT, "DATABASE_PORT", 5432),
    database,
    user,
    password,
  };
}

export function createPostgresPool(options: PostgresPoolOptions = {}): Pool {
  const pool = new Pool(buildPostgresPoolConfig(options));
  pool.on("error", (error) => {
    // node-postgres emits errors from idle clients on the Pool itself. Keeping an
    // explicit listener prevents a transient database/network failure from
    // becoming an unhandled EventEmitter error that terminates the process.
    console.error("Unexpected PostgreSQL idle-client error", error);
  });
  return pool;
}
