import { Pool, type PoolConfig } from "pg";

export interface PostgresPoolOptions {
  connectionString?: string;
  max?: number;
}

export function createPostgresPool(options: PostgresPoolOptions = {}): Pool {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for PostgreSQL persistence");
  }

  const config: PoolConfig = {
    connectionString,
    max: options.max ?? 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "loto-lab",
  };

  return new Pool(config);
}
