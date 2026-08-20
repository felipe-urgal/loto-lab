import { createPostgresPool } from "../db/client.js";
import { runMigrations } from "../db/migrations.js";
import { runOperationalSync } from "../operations/sync.js";

async function main(): Promise<void> {
  const pool = createPostgresPool();
  try {
    await runMigrations(pool);
    const result = await runOperationalSync(pool);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === "failed") process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
