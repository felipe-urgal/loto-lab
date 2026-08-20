import type { LotteryId } from "../domain/types.js";
import { createPostgresPool } from "../db/client.js";
import { runMigrations } from "../db/migrations.js";
import { PostgresContestRepository } from "../persistence/contestRepository.js";

const LOTTERIES: LotteryId[] = ["mega-sena", "lotofacil", "dia-de-sorte"];

async function main(): Promise<void> {
  const pool = createPostgresPool();
  try {
    await runMigrations(pool);
    const repository = new PostgresContestRepository(pool);
    const statuses = await Promise.all(
      LOTTERIES.map((lottery) => repository.getDataStatus(lottery)),
    );
    process.stdout.write(`${JSON.stringify({ items: statuses }, null, 2)}\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
