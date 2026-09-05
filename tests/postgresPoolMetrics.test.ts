import assert from "node:assert/strict";
import test from "node:test";
import { postgresPoolMetricsSnapshot } from "../src/observability/postgresPoolMetrics.js";

test("PostgreSQL pool metrics expose fixed-cardinality connection pressure", () => {
  assert.deepEqual(postgresPoolMetricsSnapshot({
    totalCount: 8,
    idleCount: 3,
    waitingCount: 2,
  }), {
    totalConnections: 8,
    idleConnections: 3,
    activeConnections: 5,
    waitingRequests: 2,
  });
});

test("PostgreSQL pool metrics never emit negative or impossible connection counts", () => {
  assert.deepEqual(postgresPoolMetricsSnapshot({
    totalCount: 2,
    idleCount: 5,
    waitingCount: -3,
  }), {
    totalConnections: 2,
    idleConnections: 2,
    activeConnections: 0,
    waitingRequests: 0,
  });

  assert.deepEqual(postgresPoolMetricsSnapshot({
    totalCount: Number.NaN,
    idleCount: Number.POSITIVE_INFINITY,
    waitingCount: Number.NaN,
  }), {
    totalConnections: 0,
    idleConnections: 0,
    activeConnections: 0,
    waitingRequests: 0,
  });
});
