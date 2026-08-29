import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Contest } from "../src/domain/types.js";
import { getAnalysisJobManager } from "../src/analysis/jobManager.js";
import { createLotoLabServer } from "../src/api/server.js";
import { expensiveAnalysisGate } from "../src/api/workGate.js";
import { PostgresContestRepository } from "../src/persistence/contestRepository.js";
import { PostgresStrategyRepository } from "../src/persistence/strategyRepository.js";
import { createIsolatedPostgresDatabase } from "./helpers/postgres.js";

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

async function waitForJobStatus(
  baseUrl: string,
  id: number,
  expectedStatus: string,
  timeoutMs = 5_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/v1/analysis-jobs/${id}`);
    assert.equal(response.status, 200);
    const job = await responseJson(response);
    if (job.status === expectedStatus) return job;
    if (["completed", "failed", "cancelled"].includes(String(job.status))) {
      throw new Error(`Analysis job ${id} reached ${String(job.status)} before ${expectedStatus}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Analysis job ${id} did not reach ${expectedStatus} within ${timeoutMs}ms`);
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
    const database = await createIsolatedPostgresDatabase({ label: "analysis-jobs-api", max: 4 });
    const { pool } = database;
    const manager = getAnalysisJobManager(pool);

    await new PostgresContestRepository(pool).upsertMany(
      Array.from({ length: 26 }, (_, index) => makeMegaContest(index + 1)),
    );

    const strategies = new PostgresStrategyRepository(pool);
    const megaStrategy = await strategies.upsert({
      slug: "analysis-jobs-mega",
      lottery: "mega-sena",
      name: "Analysis jobs Mega-Sena",
      methodologyVersion: "test-v1",
      config: {
        gameCount: 1,
        warmupContests: 20,
        startContest: 21,
        endContest: 21,
      },
    });
    const lotofacilStrategy = await strategies.upsert({
      slug: "analysis-jobs-lotofacil",
      lottery: "lotofacil",
      name: "Analysis jobs Lotofácil",
      methodologyVersion: "test-v1",
      config: {
        gameCount: 1,
        warmupContests: 20,
        fixedCount: 9,
      },
    });

    await manager.start();

    const server = createLotoLabServer({ pool, corsOrigin: "http://localhost:5173" });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    t.after(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await manager.stopAndDrain();
      await database.close();
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
    assert.equal(((await responseJson(invalidLottery)).error as { code: string }).code, "INVALID_LOTTERY");

    const invalidRange = await postJson(baseUrl, "/api/v1/analysis-jobs", {
      kind: "backtest",
      lottery: "mega-sena",
      warmupContests: 20,
      startContest: 25,
      endContest: 21,
    });
    assert.equal(invalidRange.status, 400);
    assert.equal(((await responseJson(invalidRange)).error as { code: string }).code, "INVALID_ARGUMENT");

    const missingVersion = await postJson(baseUrl, "/api/v1/analysis-jobs", {
      kind: "backtest",
      lottery: "mega-sena",
      strategyVersionId: 999_999,
    });
    assert.equal(missingVersion.status, 404);
    assert.equal(
      ((await responseJson(missingVersion)).error as { code: string }).code,
      "STRATEGY_VERSION_NOT_FOUND",
    );

    const strategyMismatch = await postJson(baseUrl, "/api/v1/analysis-jobs", {
      kind: "backtest",
      lottery: "mega-sena",
      strategyVersionId: lotofacilStrategy.latestVersionId,
    });
    assert.equal(strategyMismatch.status, 409);
    assert.equal(
      ((await responseJson(strategyMismatch)).error as { code: string }).code,
      "STRATEGY_LOTTERY_MISMATCH",
    );

    const invalidFixedCount = await postJson(baseUrl, "/api/v1/analysis-jobs", {
      kind: "backtest",
      lottery: "lotofacil",
      fixedCount: 7,
    });
    assert.equal(invalidFixedCount.status, 400);
    assert.equal(
      ((await responseJson(invalidFixedCount)).error as { code: string }).code,
      "INVALID_ARGUMENT",
    );

    const badLimit = await fetch(`${baseUrl}/api/v1/analysis-jobs?limit=0`);
    assert.equal(badLimit.status, 400);
    assert.equal(((await responseJson(badLimit)).error as { code: string }).code, "INVALID_ARGUMENT");

    const missing = await fetch(`${baseUrl}/api/v1/analysis-jobs/999999`);
    assert.equal(missing.status, 404);
    assert.equal(((await responseJson(missing)).error as { code: string }).code, "ANALYSIS_JOB_NOT_FOUND");

    const release = await reserveAnalysisGate();
    try {
      const strategyResponse = await postJson(baseUrl, "/api/v1/analysis-jobs", {
        kind: "backtest",
        lottery: "mega-sena",
        strategyVersionId: megaStrategy.latestVersionId,
        gameCount: 2,
      });
      assert.equal(strategyResponse.status, 202);
      const strategyJob = await responseJson(strategyResponse);
      assert.equal(strategyJob.status, "queued");
      assert.equal((strategyJob.input as Record<string, unknown>).gameCount, 2);
      assert.equal((strategyJob.input as Record<string, unknown>).warmupContests, 20);
      assert.equal((strategyJob.input as Record<string, unknown>).startContest, 21);
      assert.equal((strategyJob.input as Record<string, unknown>).endContest, 21);
      assert.equal((strategyJob.input as Record<string, unknown>).eligibleRounds, 1);
      assert.equal((strategyJob.input as Record<string, unknown>).strategyId, megaStrategy.id);
      assert.equal(
        (strategyJob.input as Record<string, unknown>).strategyVersionId,
        megaStrategy.latestVersionId,
      );

      const cancelStrategy = await postJson(
        baseUrl,
        `/api/v1/analysis-jobs/${Number(strategyJob.id)}/cancel`,
        {},
      );
      assert.equal(cancelStrategy.status, 200);
      assert.equal((await responseJson(cancelStrategy)).status, "cancelled");

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

      const cancelAgain = await postJson(baseUrl, `/api/v1/analysis-jobs/${queuedId}/cancel`, {});
      assert.equal(cancelAgain.status, 200);
      const cancelledAgain = await responseJson(cancelAgain);
      assert.equal(cancelledAgain.status, "cancelled");
      assert.equal(cancelledAgain.cancelRequested, true);

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

      const lotofacilResponse = await postJson(baseUrl, "/api/v1/analysis-jobs", {
        kind: "backtest",
        lottery: "lotofacil",
        strategyVersionId: lotofacilStrategy.latestVersionId,
      });
      assert.equal(lotofacilResponse.status, 202);
      const lotofacil = await responseJson(lotofacilResponse);
      assert.equal(lotofacil.status, "queued");
      assert.equal((lotofacil.input as Record<string, unknown>).fixedCount, 9);
      assert.equal(
        (lotofacil.input as Record<string, unknown>).strategyVersionId,
        lotofacilStrategy.latestVersionId,
      );

      const cancelLotofacil = await postJson(
        baseUrl,
        `/api/v1/analysis-jobs/${Number(lotofacil.id)}/cancel`,
        {},
      );
      assert.equal(cancelLotofacil.status, 200);
      assert.equal((await responseJson(cancelLotofacil)).status, "cancelled");
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

    const cancelCompleted = await postJson(
      baseUrl,
      `/api/v1/analysis-jobs/${Number(running.id)}/cancel`,
      {},
    );
    assert.equal(cancelCompleted.status, 200);
    const completedAfterCancel = await responseJson(cancelCompleted);
    assert.equal(completedAfterCancel.status, "completed");
    assert.equal(completedAfterCancel.cancelRequested, false);

    const cancellableResponse = await postJson(baseUrl, "/api/v1/analysis-jobs", {
      kind: "backtest",
      lottery: "mega-sena",
      gameCount: 10,
      warmupContests: 1,
      startContest: 2,
      endContest: 26,
    });
    assert.equal(cancellableResponse.status, 202);
    const cancellable = await responseJson(cancellableResponse);
    const cancellableId = Number(cancellable.id);
    await waitForJobStatus(baseUrl, cancellableId, "running");

    const cancelRunning = await postJson(baseUrl, `/api/v1/analysis-jobs/${cancellableId}/cancel`, {});
    assert.equal(cancelRunning.status, 200);
    const cancellationRequested = await responseJson(cancelRunning);
    assert.equal(cancellationRequested.status, "running");
    assert.equal(cancellationRequested.cancelRequested, true);

    const cancelledTerminal = await waitForTerminalJob(baseUrl, cancellableId);
    assert.equal(cancelledTerminal.status, "cancelled");
    assert.equal(cancelledTerminal.cancelRequested, true);

    const missingCancel = await postJson(baseUrl, "/api/v1/analysis-jobs/999999/cancel", {});
    assert.equal(missingCancel.status, 404);
    assert.equal(((await responseJson(missingCancel)).error as { code: string }).code, "ANALYSIS_JOB_NOT_FOUND");

    const unsupported = await fetch(`${baseUrl}/api/v1/analysis-jobs/1`, { method: "PUT" });
    assert.equal(unsupported.status, 404);
    assert.equal(((await responseJson(unsupported)).error as { code: string }).code, "ROUTE_NOT_FOUND");
  },
);
