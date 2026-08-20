import { createPostgresPool } from "../db/client.js";
import { runMigrations } from "../db/migrations.js";

async function main(): Promise<void> {
  const pool = createPostgresPool();
  try {
    const result = await runMigrations(pool);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
