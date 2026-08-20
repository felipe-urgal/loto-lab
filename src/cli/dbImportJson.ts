import { loadContests } from "../data/jsonStore.js";
import { createPostgresPool } from "../db/client.js";
import { runMigrations } from "../db/migrations.js";
import { PostgresContestRepository } from "../persistence/contestRepository.js";

async function main(): Promise<void> {
  const path = process.argv[2] ?? "data/contests.json";
  const contests = await loadContests(path);
  const pool = createPostgresPool();

  try {
    await runMigrations(pool);
    const repository = new PostgresContestRepository(pool);
    await repository.upsertMany(contests);

    const byLottery = Object.fromEntries(
      ["mega-sena", "lotofacil", "dia-de-sorte"].map((lottery) => [
        lottery,
        contests.filter((contest) => contest.lottery === lottery).length,
      ]),
    );

    process.stdout.write(
      `${JSON.stringify({ imported: contests.length, byLottery }, null, 2)}\n`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
