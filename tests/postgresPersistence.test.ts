import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, GeneratedGame } from "../src/domain/types.js";
import { runMigrations } from "../src/db/migrations.js";
import { PostgresContestRepository } from "../src/persistence/contestRepository.js";
import { PostgresStrategyRepository } from "../src/persistence/strategyRepository.js";
import { PostgresGameRepository } from "../src/persistence/gameRepository.js";
import { PostgresBacktestRepository } from "../src/persistence/backtestRepository.js";
import { createIsolatedPostgresDatabase } from "./helpers/postgres.js";

const databaseUrl = process.env.DATABASE_URL;

test(
  "PostgreSQL persists contests, strategies, game batches and backtests",
  { skip: !databaseUrl },
  async () => {
    const database = await createIsolatedPostgresDatabase({
      label: "postgres-persistence",
      migrate: false,
    });
    const { pool } = database;

    try {
      const firstMigration = await runMigrations(pool);
      assert.ok(firstMigration.applied.includes("001_initial.sql"));

      const secondMigration = await runMigrations(pool);
      assert.ok(secondMigration.skipped.includes("001_initial.sql"));

      const contests = new PostgresContestRepository(pool);
      const target: Contest = {
        lottery: "lotofacil",
        number: 3767,
        date: "2026-08-20",
        numbers: [1, 2, 3, 4, 5, 8, 9, 10, 11, 13, 14, 17, 20, 21, 25],
        amountCollected: 25_000_000,
        prizeTiers: [
          { description: "15 acertos", winners: 1, prizeValue: 1_500_000 },
          { description: "12 acertos", winners: 100_000, prizeValue: 14 },
        ],
      };
      await contests.upsertMany([target]);
      await contests.upsertMany([{ ...target, amountCollected: undefined, prizeTiers: undefined }]);

      const persistedContest = await contests.findByNumber("lotofacil", 3767);
      assert.deepEqual(persistedContest?.numbers, target.numbers);
      assert.equal(persistedContest?.amountCollected, 25_000_000);
      assert.equal(persistedContest?.prizeTiers?.length, 2);
      assert.equal(persistedContest?.prizeTiers?.[1]?.prizeValue, 14);

      const strategies = new PostgresStrategyRepository(pool);
      const strategy = await strategies.upsert({
        slug: "lotofacil-core-8",
        lottery: "lotofacil",
        name: "Lotofácil — 8 fixas",
        methodologyVersion: "2026-08",
        config: { fixedCount: 8, repeatTargets: [8, 9, 10] },
      });
      assert.equal((await strategies.findBySlug("lotofacil-core-8"))?.id, strategy.id);

      const game: GeneratedGame = {
        lottery: "lotofacil",
        numbers: [1, 2, 4, 5, 6, 9, 10, 11, 13, 18, 20, 21, 23, 24, 25],
        fixedNumbers: [1, 2, 5, 9, 10, 20, 21, 25],
        variableNumbers: [4, 6, 11, 13, 18, 23, 24],
        metadata: {
          odd: 8,
          even: 7,
          sum: 212,
          repeatedFromLastContest: [1, 2, 5, 9, 11, 13, 21, 24],
          lineDistribution: [3, 3, 3, 2, 4],
          columnDistribution: [3, 3, 3, 3, 3],
        },
      };

      const games = new PostgresGameRepository(pool);
      const batch = await games.saveBatch({
        lottery: "lotofacil",
        strategyId: strategy.id,
        targetContestNumber: 3768,
        generatorOptions: { gameCount: 1, fixedCount: 8 },
        games: [game],
      });
      assert.equal(batch.games.length, 1);
      assert.deepEqual(batch.games[0]?.fixedNumbers, game.fixedNumbers);

      const backtests = new PostgresBacktestRepository(pool);
      const run = await backtests.save({
        lottery: "lotofacil",
        strategyId: strategy.id,
        options: { fixedCount: 8, gameCount: 4 },
        summary: {
          testedContests: 100,
          totalGames: 400,
          totalCost: 1_400,
          financialCost: 1_400,
          totalPrizeValue: 980,
          roi: -0.3,
          financialCoverage: 1,
        },
        rounds: [
          { contest: 3766, bestHits: 12 },
          { contest: 3767, bestHits: 11 },
        ],
      });
      assert.equal(run.rounds.length, 2);
      assert.equal(run.summary.roi, -0.3);
      assert.equal((await backtests.findById(run.id))?.rounds[0]?.contest, 3766);
    } finally {
      await database.close();
    }
  },
);
