import test from "node:test";
import assert from "node:assert/strict";
import type { GeneratedGame } from "../src/domain/types.js";
import { createPostgresPool } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrations.js";
import { PostgresAnalysisJobRepository } from "../src/persistence/analysisJobRepository.js";
import { PostgresGameRepository } from "../src/persistence/gameRepository.js";
import { RealBetService } from "../src/realBets/service.js";

const databaseUrl = process.env.DATABASE_URL;

test(
  "analysis job recovery finalizes cancelled jobs and requeues only active work",
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool({ connectionString: databaseUrl! });
    try {
      await runMigrations(pool);
      await pool.query("TRUNCATE TABLE analysis_jobs RESTART IDENTITY CASCADE");
      const repository = new PostgresAnalysisJobRepository(pool);

      const cancelled = await repository.create("backtest", "mega-sena", { lottery: "mega-sena" });
      await pool.query(
        "UPDATE analysis_jobs SET status='running', started_at=NOW(), cancel_requested=TRUE WHERE id=$1",
        [cancelled.id],
      );
      const active = await repository.create("backtest", "mega-sena", { lottery: "mega-sena" });
      await pool.query(
        "UPDATE analysis_jobs SET status='running', started_at=NOW(), cancel_requested=FALSE WHERE id=$1",
        [active.id],
      );

      assert.equal(await repository.recoverRunning(), 2);
      const cancelledAfter = await repository.findById(cancelled.id);
      const activeAfter = await repository.findById(active.id);
      assert.equal(cancelledAfter?.status, "cancelled");
      assert.equal(cancelledAfter?.cancelRequested, true);
      assert.ok(cancelledAfter?.finishedAt);
      assert.equal(activeAfter?.status, "queued");
      assert.equal(activeAfter?.cancelRequested, false);
      assert.equal(activeAfter?.startedAt, undefined);

      const claimed = await repository.claimNext();
      assert.equal(claimed?.id, active.id);
    } finally {
      await pool.end();
    }
  },
);

test(
  "real bet cannot be reconciled against a contest different from its generated batch target",
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool({ connectionString: databaseUrl! });
    try {
      await runMigrations(pool);
      await pool.query(`
        TRUNCATE TABLE
          real_bet_games,
          real_bets,
          generated_games,
          generated_game_batches
        RESTART IDENTITY CASCADE
      `);

      const game: GeneratedGame = {
        lottery: "mega-sena",
        numbers: [1, 2, 3, 4, 5, 6],
        fixedNumbers: [1, 2, 3],
        variableNumbers: [4, 5, 6],
        metadata: {
          odd: 3,
          even: 3,
          sum: 21,
          repeatedFromLastContest: [],
        },
      };
      const batch = await new PostgresGameRepository(pool).saveBatch({
        lottery: "mega-sena",
        targetContestNumber: 3000,
        generatorOptions: { test: true },
        games: [game],
      });

      const service = new RealBetService(pool);
      await assert.rejects(
        () => service.create({
          batchId: batch.id,
          contestNumber: 3001,
          actualCost: 6,
        }),
        /CONTEST_TARGET_MISMATCH:3000:3001/,
      );
      assert.equal(await service.realBets.findByBatchId(batch.id), undefined);
    } finally {
      await pool.end();
    }
  },
);
