import type { LotteryId } from "../domain/types.js";
import { CaixaContestSource } from "../data/caixa.js";
import { bootstrapLotteryHistory } from "../data/bootstrap.js";
import { createPostgresPool } from "../db/client.js";
import { runMigrations } from "../db/migrations.js";
import { PostgresContestRepository } from "../persistence/contestRepository.js";

const LOTTERIES: LotteryId[] = ["mega-sena", "lotofacil", "dia-de-sorte"];

function parseLotteries(value: string | undefined): LotteryId[] {
  if (value === undefined || value === "all") return LOTTERIES;
  if (!LOTTERIES.includes(value as LotteryId)) {
    throw new Error(`Lottery must be one of: ${LOTTERIES.join(", ")} or all`);
  }
  return [value as LotteryId];
}

async function main(): Promise<void> {
  const [lotteryArg] = process.argv.slice(2);
  const lotteries = parseLotteries(lotteryArg);
  const pool = createPostgresPool();

  try {
    await runMigrations(pool);
    const repository = new PostgresContestRepository(pool);
    const source = new CaixaContestSource();
    let totalFailures = 0;

    for (const lottery of lotteries) {
      process.stdout.write(`\n${lottery}: verificando histórico oficial...\n`);
      const result = await bootstrapLotteryHistory(source, repository, lottery, {
        concurrency: 4,
        retries: 3,
        retryDelayMs: 300,
        onProgress(progress) {
          const percent = progress.totalMissing === 0
            ? 100
            : Math.round((progress.processed / progress.totalMissing) * 100);
          process.stdout.write(
            `\r${lottery}: ${progress.processed}/${progress.totalMissing} (${percent}%) | ` +
              `baixados ${progress.fetched} | falhas ${progress.failed}`,
          );
        },
      });

      if (result.missingBefore > 0) process.stdout.write("\n");
      process.stdout.write(
        `${JSON.stringify({
          lottery: result.lottery,
          latestOfficialContest: result.latestOfficialContest,
          existingBefore: result.existingBefore,
          missingBefore: result.missingBefore,
          fetched: result.fetched,
          failed: result.failed,
          totalStored: result.totalStored,
        }, null, 2)}\n`,
      );

      if (result.failures.length > 0) {
        totalFailures += result.failures.length;
        process.stderr.write(
          `Falhas em ${lottery}: ${result.failures.map((item) => `#${item.contest}`).join(", ")}\n`,
        );
      }
    }

    if (totalFailures > 0) {
      throw new Error(
        `${totalFailures} concurso(s) não puderam ser baixados após retries. Rode db:bootstrap novamente para retomar.`,
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
