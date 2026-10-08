import test from "node:test";
import type { Pool } from "pg";
import assert from "node:assert/strict";
import type { Contest, GeneratedGame } from "../src/domain/types.js";
import { runMigrations } from "../src/db/migrations.js";
import { PostgresContestRepository } from "../src/persistence/contestRepository.js";
import { PostgresStrategyRepository } from "../src/persistence/strategyRepository.js";
import { PostgresGameRepository } from "../src/persistence/gameRepository.js";
import { PostgresRealBetRepository } from "../src/persistence/realBetRepository.js";
import { PostgresBacktestRepository } from "../src/persistence/backtestRepository.js";
import { createIsolatedPostgresDatabase } from "./helpers/postgres.js";

const databaseUrl = process.env.DATABASE_URL;

/** Commit a concurrent change precisely after the first read statement completes. */
function poolWithInterleavedCommit(pool: Pool, needle: string, update: () => Promise<void>): Pool {
  let invoked = false;
  return new Proxy(pool, {
    get(target, property, receiver) {
      if (property !== "connect") return Reflect.get(target, property, receiver);
      return async () => {
        const reader = await target.connect();
        return new Proxy(reader, {
          get(client, key, clientReceiver) {
            if (key !== "query") return Reflect.get(client, key, clientReceiver);
            return async (...args: unknown[]) => {
              const result: unknown = await Reflect.apply(client.query, client, args);
              if (!invoked && typeof args[0] === "string" && args[0].includes(needle)) {
                invoked = true;
                await update();
              }
              return result;
            };
          },
        });
      };
    },
  }) as Pool;
}

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
        strategyVersionId: strategy.latestVersionId,
        targetContestNumber: 3768,
        generatorOptions: { gameCount: 1, fixedCount: 8 },
        games: [game],
      });
      assert.equal(batch.strategyId, strategy.id);
      assert.equal(batch.strategyVersionId, strategy.latestVersionId);
      assert.equal((await games.findBatch(batch.id))?.strategyVersionId, strategy.latestVersionId);
      assert.equal((await games.listRecent("lotofacil"))[0]?.strategyVersionId, strategy.latestVersionId);
      const key = `persistence-version-${strategy.id}`;
      const idempotentInput = {
        lottery: "lotofacil" as const,
        strategyId: strategy.id,
        strategyVersionId: strategy.latestVersionId,
        games: [game],
      };
      const initial = await games.saveBatchIdempotent(idempotentInput, key);
      const repeated = await games.saveBatchIdempotent(idempotentInput, key);
      assert.equal(initial.created, true);
      assert.equal(repeated.created, false);
      assert.equal(repeated.batch.id, initial.batch.id);
      assert.equal(repeated.batch.strategyVersionId, strategy.latestVersionId);
      assert.equal(repeated.batch.strategyId, strategy.id);
      assert.equal(batch.games.length, 1);
      assert.deepEqual(batch.games[0]?.fixedNumbers, game.fixedNumbers);

      const realBets = new PostgresRealBetRepository(pool);
      const backtests = new PostgresBacktestRepository(pool);
      for (const invalidLimit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 999999]) {
        await assert.rejects(games.listRecent("lotofacil", invalidLimit), /limit/i);
        await assert.rejects(realBets.listRecent("lotofacil", invalidLimit), /limit/i);
        await assert.rejects(realBets.listRealBets(1, invalidLimit), /limit/i);
        await assert.rejects(backtests.listRecent("lotofacil", invalidLimit), /limit/i);
        await assert.rejects(backtests.listRecentSummaries("lotofacil", invalidLimit), /limit/i);
      }
      const bet = await realBets.create({
        batchId: batch.id,
        lottery: "lotofacil",
        contestNumber: 3768,
        actualCost: 3.5,
        playedAt: new Date().toISOString(),
        games: [{ batchPosition: 1, game }],
      });
      let updatedBetweenStatements = false;
      const racingPool = poolWithInterleavedCommit(pool, "FROM real_bets", async () => {
        updatedBetweenStatements = true;
        const writer = await pool.connect();
        try {
          await writer.query("BEGIN");
          await writer.query(
            "UPDATE real_bet_games SET prize_value = 20 WHERE real_bet_id = $1",
            [bet.id],
          );
          await writer.query(
            "UPDATE real_bets SET status = 'checked', checked_at = NOW(), total_prize_value = 20, net_result = 16.5 WHERE id = $1",
            [bet.id],
          );
          await writer.query("COMMIT");
        } catch (error) {
          await writer.query("ROLLBACK");
          throw error;
        } finally {
          writer.release();
        }
      });
      const readDuringReconciliation = await new PostgresRealBetRepository(racingPool).findById(bet.id);
      assert.equal(updatedBetweenStatements, true);
      assert.equal(readDuringReconciliation?.status, "awaiting_result");
      assert.equal(readDuringReconciliation?.totalPrizeValue, undefined);
      assert.equal(readDuringReconciliation?.games[0]?.prizeValue, undefined);
      const reconciled = await realBets.findById(bet.id);
      assert.equal(reconciled?.status, "checked");
      assert.equal(reconciled?.totalPrizeValue, 20);
      assert.equal(reconciled?.games[0]?.prizeValue, 20);

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

      // Updating the batch and a game between SELECTs must not yield a mixed snapshot.
      const batchRacePool = poolWithInterleavedCommit(pool, "FROM generated_game_batches batch", async () => {
        const writer = await pool.connect();
        try {
          await writer.query("BEGIN");
          await writer.query("UPDATE generated_game_batches SET archived_at = NOW() WHERE id = $1", [batch.id]);
          await writer.query(
            "UPDATE generated_games SET metadata = jsonb_set(metadata, '{sum}', '999'::jsonb) WHERE batch_id = $1",
            [batch.id],
          );
          await writer.query("COMMIT");
        } catch (error) {
          await writer.query("ROLLBACK");
          throw error;
        } finally {
          writer.release();
        }
      });
      const batchDuringChange = await new PostgresGameRepository(batchRacePool).findBatch(batch.id);
      assert.equal(batchDuringChange?.archivedAt, undefined);
      assert.equal(batchDuringChange?.games[0]?.metadata.sum, game.metadata.sum);
      const changedBatch = await games.findBatch(batch.id);
      assert.ok(changedBatch?.archivedAt);
      assert.equal(changedBatch.games[0]?.metadata.sum, 999);

      // The same guarantee applies to a mutable backtest parent and its rounds.
      const backtestRacePool = poolWithInterleavedCommit(pool, "FROM backtest_runs", async () => {
        const writer = await pool.connect();
        try {
          await writer.query("BEGIN");
          await writer.query(
            "UPDATE backtest_runs SET summary = jsonb_set(summary, '{testedContests}', '777'::jsonb) WHERE id = $1",
            [run.id],
          );
          await writer.query(
            "UPDATE backtest_rounds SET payload = jsonb_set(payload, '{bestHits}', '15'::jsonb) WHERE backtest_run_id = $1",
            [run.id],
          );
          await writer.query("COMMIT");
        } catch (error) {
          await writer.query("ROLLBACK");
          throw error;
        } finally {
          writer.release();
        }
      });
      const backtestDuringChange = await new PostgresBacktestRepository(backtestRacePool).findById(run.id);
      assert.equal(backtestDuringChange?.summary.testedContests, 100);
      assert.equal(backtestDuringChange?.rounds[0]?.bestHits, 12);
      const changedBacktest = await backtests.findById(run.id);
      assert.equal(changedBacktest?.summary.testedContests, 777);
      assert.equal(changedBacktest?.rounds[0]?.bestHits, 15);
    } finally {
      await database.close();
    }
  },
);
