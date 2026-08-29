import test from "node:test";
import assert from "node:assert/strict";
import type { Contest } from "../src/domain/types.js";
import { AnalysisJobManager, getAnalysisJobManager } from "../src/analysis/jobManager.js";
import { expensiveAnalysisGate } from "../src/api/workGate.js";
import { PostgresAnalysisJobRepository } from "../src/persistence/analysisJobRepository.js";
import { PostgresContestRepository } from "../src/persistence/contestRepository.js";
import { createIsolatedPostgresDatabase } from "./helpers/postgres.js";

const databaseUrl = process.env.DATABASE_URL;

function makeMegaContest(number: number): Contest {
  const numbers = Array.from({ length: 6 }, (_, index) => {
    return ((number * 7 + index * 11) % 60) + 1;
  }).sort((a, b) => a - b);

  return {
    lottery: "mega-sena",
    number,
    date: `2026-01-${String(((number - 1) % 28) + 1).padStart(2, "0")}`,
    numbers,
  };
}

async function waitForTerminalJob(manager: AnalysisJobManager, id: number, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await manager.findById(id);
    if (job && ["completed", "failed", "cancelled"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Analysis job ${id} did not reach a terminal state within ${timeoutMs}ms`);
}

async function reserveAnalysisGate(timeoutMs = 1_000): Promise<() => void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const release = expensiveAnalysisGate.acquire();
    if (release) return release;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Analysis gate did not become available within ${timeoutMs}ms`);
}

test(
  "analysis job manager recovers, retries transient claim failures, executes and cancels queued work",
  { skip: !databaseUrl, timeout: 20_000 },
  async () => {
    const database = await createIsolatedPostgresDatabase({ label: "analysis-job-manager" });
    const { pool } = database;
    const manager = new AnalysisJobManager(pool);

    try {
      await new PostgresContestRepository(pool).upsertMany(
        Array.from({ length: 21 }, (_, index) => makeMegaContest(index + 1)),
      );

      const input = {
        lottery: "mega-sena",
        gameCount: 1,
        warmupContests: 20,
        startContest: 21,
        endContest: 21,
        persist: true,
      };
      const repository = new PostgresAnalysisJobRepository(pool);
      const interrupted = await repository.create("backtest", "mega-sena", input);
      await pool.query(
        "UPDATE analysis_jobs SET status='running', started_at=NOW() WHERE id=$1",
        [interrupted.id],
      );

      const internalRepository = (manager as unknown as {
        repository: PostgresAnalysisJobRepository;
      }).repository;
      const claimNext = internalRepository.claimNext.bind(internalRepository);
      let injectedClaimFailures = 0;
      internalRepository.claimNext = async () => {
        if (injectedClaimFailures === 0) {
          injectedClaimFailures += 1;
          throw new Error("transient claim failure for test");
        }
        return claimNext();
      };

      assert.equal(await manager.start(), 1);

      const completed = await waitForTerminalJob(manager, interrupted.id);
      assert.equal(injectedClaimFailures, 1);
      assert.equal(completed.status, "completed");
      assert.equal(completed.cancelRequested, false);
      assert.equal(completed.result?.lottery, "mega-sena");
      assert.equal(completed.result?.roundCount, 1);
      assert.ok(completed.startedAt);
      assert.ok(completed.finishedAt);

      const listed = await manager.list(10, "mega-sena");
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.id, interrupted.id);
      assert.equal((await manager.findById(interrupted.id))?.status, "completed");

      const release = await reserveAnalysisGate();
      try {
        const queued = await manager.enqueue("backtest", "mega-sena", input);
        const cancelled = await manager.cancel(queued.id);
        assert.equal(cancelled?.status, "cancelled");
        assert.equal(cancelled?.cancelRequested, true);
        assert.ok(cancelled?.finishedAt);
        assert.equal((await manager.findById(queued.id))?.status, "cancelled");
      } finally {
        release();
      }

      assert.equal(await manager.cancel(999_999), undefined);

      const singleton = getAnalysisJobManager(pool);
      assert.strictEqual(getAnalysisJobManager(pool), singleton);
      await singleton.stopAndDrain();
    } finally {
      await manager.stopAndDrain();
      await database.close();
    }
  },
);
