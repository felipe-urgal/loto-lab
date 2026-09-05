import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { PostgresAnalysisJobRepository } from "../src/persistence/analysisJobRepository.js";

function poolReturning(row: Record<string, unknown>, onQuery?: (sql: string) => void): Pool {
  return {
    query: async (sql: string) => {
      onQuery?.(sql);
      return { rows: [row], rowCount: 1 };
    },
  } as unknown as Pool;
}

test("analysis job metrics aggregate bounded queue health without high-cardinality dimensions", async () => {
  let sql = "";
  const repository = new PostgresAnalysisJobRepository(poolReturning({
    queued: 3,
    running: 1,
    completed: 12,
    failed: 2,
    cancelled: 4,
    oldest_queued_age_seconds: "42.75",
  }, (query) => {
    sql = query;
  }));

  const snapshot = await repository.metricsSnapshot();

  assert.deepEqual(snapshot, {
    counts: {
      queued: 3,
      running: 1,
      completed: 12,
      failed: 2,
      cancelled: 4,
    },
    oldestQueuedAgeSeconds: 42.75,
  });
  assert.match(sql, /COUNT\(\*\) FILTER \(WHERE status = 'queued'\)/);
  assert.match(sql, /MIN\(created_at\) FILTER \(WHERE status = 'queued'\)/);
  assert.doesNotMatch(sql, /GROUP BY/i);
  assert.doesNotMatch(sql, /lottery|kind|input|result|error/i);
});

test("analysis job metrics keep unknown queue age distinct from zero", async () => {
  const repository = new PostgresAnalysisJobRepository(poolReturning({
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    oldest_queued_age_seconds: null,
  }));

  const snapshot = await repository.metricsSnapshot();

  assert.equal(snapshot.oldestQueuedAgeSeconds, null);
  assert.equal(snapshot.counts.queued, 0);
});
