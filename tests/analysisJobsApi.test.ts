import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Contest } from "../src/domain/types.js";
import { getAnalysisJobManager } from "../src/analysis/jobManager.js";
import { createLotoLabServer } from "../src/api/server.js";
import { expensiveAnalysisGate } from "../src/api/workGate.js";
import { createPostgresPool } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrations.js";
import { PostgresContestRepository } from "../src/persistence/contestRepository.js";

const databaseUrl = process.env.DATABASE_URL;

function makeMegaContest(number: number): Contest {
  const numbers = Array.from({ length: 6 }, (_, index) => {
    return ((number * 7 + index * 11) % 60) + 1;
  }).sort((a, b) => a - b);

  return {
    lottery: "mega-sena",
    number,
    date: `2026-02-${String(((number - 1) % 28) + 1).padStart(2, "0")}`,
    numbers,
    prizeTiers: [
      { description: "6 acertos", winners: 0, prizeValue: 0 },
      { description: "5 acertos", winners: 10, prizeValue: 50_000 },
      { description: "4 acertos", winners: 1_000, prizeValue: 1_000 },
    ],
  };
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

async function postJson(baseUrl: string, path: string, body: Record<string, unknown>) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function waitForTerminalJob(baseUrl: string, id: number, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/v1/analysis-jobs/${id}`);
    assert.equal(response.status, 200);
    const job = await responseJson(response);
    if (["completed", "failed", "cancelled"].includes(String(job.status))) return job;
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
  "analysis jobs API validates, enqueues, lists, fetches and cancels work",
  { skip: !databaseUrl, timeout: 30_000 },
  async (t) => {
    const pool = createPostgresPool({ connectionString: databaseUrl!, max: 4 });
    const manager = getAnalysisJobManager(pool);

    await runMigrations(pool);
    await pool.query(`
      TRUNCATE TABLE
        analysis_jobs,
        backtest_rounds,
        backtest_runs,
        strategy_versions,
        strategies,
        contest_prize_tiers,
        contests
      RESTART IDENTITY CASCADE
    `);

    await new PostgresContestRepository(pool).upsertMany(
      Array.from({ length: 26 }, (_, index) => makeMegaContest(index + 1)),
    );
    await manager.start();

    const server = createLotoLabServer({ pool, corsOrigin: "http://localhost:5173" });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    t.after(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await manager.stopAndDrain();
      await pool.end();
    });

    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const options = await fetch(`${baseUrl}/api/v1/analysis-jobs`, { method: "OPTIONS" });
    assert.equal(options.status, 204);
    assert.equal(options.headers.get("access-control-allow-origin"), "http://localhost:5173");

    const invalidKind = await postJson(baseUrl, "/api/v1/analysis-jobs", {
      kind: "other",
      lottery: "mega-sena",
    });
    assert.equal(invalidKind.status, 400);
    assert.equal(((await responseJson(invalidKind)).error as { code: string }).code, "INVALID_ARGUMENT");

    const invalidLottery = await postJson(baseUrl, "/api/v1/analysis-jobs", {
      kind: "backtest",
      lottery: "not-a-lottery",
    });
    assert.equal(invalidLottery.status, 400);
    assert.equal(((await responseJson(invalidLottery)).error as { code: string }).code, "INVALID_ARGUMENT");

    const invalidRange = await postJson(baseUrl, "/api/v1/analysis-jobs", {
      kind: "backtest",
      lottery: "mega-sena",
      warmupContests: 20,
      startContest: 25,
      endContest: 21,
    });
    assert.equal(invalidRange.status, 400);
    assert.equal(((await responseJson(invalidRange)).error as { code: string }).code, "INVALID_ARGUMENT");

    const badLimit = await fetch(`${baseUrl}/api/v1/analysis-jobs?limit=0`);
    assert.equal(badLimit.status, 400);
    assert.equal(((await responseJson(badLimit)).error as { code: string }).code, "INVALID_ARGUMENT");

    const missing = await fetch(`${baseUrl}/api/v1/analysis-jobs/999999`);
    assert.equal(missing.status, 404);
    assert.equal(((await responseJson(missing)).error as { code: string }).code, "ANALYSIS_JOB_NOT_FOUND");

    const release = await reserveAnalysisGate();
    try {
      const queuedResponse = await postJson(baseUrl, "/api/v1/analysis-jobs", {
        kind: "backtest",
        lottery: "mega-sena",
        gameCount: 1,
        warmupContests: 20,
        startContest: 21,
        endContest: 21,
      });
      assert.equal(queuedResponse.status, 202);
      const queued = await responseJson(queuedResponse);
      assert.equal(queued.kind, "backtest");
      assert.equal(queued.lottery, "mega-sena");
      assert.equal(queued.status, "queued");
      assert.equal((queued.input as Record<string, unknown>).eligibleRounds, 1);
      const queuedId = Number(queued.id);
      assert.ok(Number.isInteger(queuedId) && queuedId > 0);

      const fetched = await fetch(`${baseUrl}/api/v1/analysis-jobs/${queuedId}`);
      assert.equal(fetched.status, 200);
      assert.equal((await responseJson(fetched)).id, queuedId);

      const list = await fetch(`${baseUrl}/api/v1/analysis-jobs?lottery=mega-sena&limit=10`);
      assert.equal(list.status, 200);
      const listed = await responseJson(list) as { items: Array<Record<string, unknown>> };
      assert.ok(listed.items.some((job) => job.id === queuedId));

      const cancel = await postJson(baseUrl, `/api/v1/analysis-jobs/${queuedId}/cancel`, {});
      assert.equal(cancel.status, 200);
      const cancelled = await responseJson(cancel);
      assert.equal(cancelled.id, queuedId);
      assert.equal(cancelled.status, "cancelled");
      assert.equal(cancelled.cancelRequested, true);

      const labResponse = await postJson(baseUrl, "/api/v1/analysis-jobs", {
        kind: "strategy-lab",
        lottery: "mega-sena",
        experiment: "fixed-core",
        gameCount: 1,
        warmupContests: 10,
        lookbackContests: 10,
        bucketSize: 5,
        randomSamples: 10,
      });
      assert.equal(labResponse.status, 202);
      const lab = await responseJson(labResponse);
      assert.equal(lab.kind, "strategy-lab");
      assert.equal(lab.status, "queued");
      assert.ok(Number((lab.input as Record<string, unknown>).eligibleTargets) > 0);
      assert.ok(Number((lab.input as Record<string, unknown>).estimatedWorkUnits) > 0);

      const labId = Number(lab.id);
      const cancelLab = await postJson(baseUrl, `/api/v1/analysis-jobs/${labId}/cancel`, {});
      assert.equal(cancelLab.status, 200);
      assert.equal((await responseJson(cancelLab)).status, "cancelled");
    } finally {
      release();
    }

    const runningResponse = await postJson(baseUrl, "/api/v1/analysis-jobs", {
      kind: "backtest",
      lottery: "mega-sena",
      gameCount: 1,
      warmupContests: 20,
      startContest: 21,
      endContest: 21,
    });
    assert.equal(runningResponse.status, 202);
    const running = await responseJson(runningResponse);
    const terminal = await waitForTerminalJob(baseUrl, Number(running.id));
    assert.equal(terminal.status, "completed");
    assert.equal((terminal.result as Record<string, unknown>).roundCount, 1);

    const missingCancel = await postJson(baseUrl, "/api/v1/analysis-jobs/999999/cancel", {});
    assert.equal(missingCancel.status, 404);
    assert.equal(((await responseJson(missingCancel)).error as { code: string }).code, "ANALYSIS_JOB_NOT_FOUND");

    const unsupported = await fetch(`${baseUrl}/api/v1/analysis-jobs/1`, { method: "PUT" });
    assert.equal(unsupported.status, 404);
    assert.equal(((await responseJson(unsupported)).error as { code: string }).code, "ROUTE_NOT_FOUND");
  },
);
