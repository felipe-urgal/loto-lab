import type { LotteryId } from "../domain/types.js";
import { CaixaContestSource } from "../data/caixa.js";
import { createPostgresPool } from "../db/client.js";
import { runMigrations } from "../db/migrations.js";
import { PostgresContestRepository } from "../persistence/contestRepository.js";

const lotteryIds: LotteryId[] = ["mega-sena", "lotofacil", "dia-de-sorte"];

function parseLottery(value: string | undefined): LotteryId {
  if (!value || !lotteryIds.includes(value as LotteryId)) {
    throw new Error(`Lottery must be one of: ${lotteryIds.join(", ")}`);
  }
  return value as LotteryId;
}

function positiveInt(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const [lotteryArg, startArg, endArg] = process.argv.slice(2);
  const lottery = parseLottery(lotteryArg);
  if ((startArg === undefined) !== (endArg === undefined)) {
    throw new Error("startContest and endContest must be informed together");
  }

  const source = new CaixaContestSource();
  const fetched =
    startArg === undefined
      ? [await source.fetchContest(lottery)]
      : await source.fetchContestRange(
          lottery,
          positiveInt(startArg, "startContest"),
          positiveInt(endArg, "endContest"),
        );

  const pool = createPostgresPool();
  try {
    await runMigrations(pool);
    const repository = new PostgresContestRepository(pool);
    await repository.upsertMany(fetched);
    const last = fetched.at(-1);

    process.stdout.write(
      `${JSON.stringify(
        {
          lottery,
          fetched: fetched.length,
          firstContest: fetched[0]?.number,
          lastContest: last?.number,
        },
        null,
        2,
      )}\n`,
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
