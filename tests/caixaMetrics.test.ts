import assert from "node:assert/strict";
import test from "node:test";
import {
  caixaMetricsSnapshot,
  recordCaixaAttempt,
  recordCaixaRequest,
  resetCaixaMetricsForTests,
} from "../src/observability/caixaMetrics.js";

test("CAIXA metrics aggregate fixed-cardinality outcomes and bounded latency percentiles", () => {
  resetCaixaMetricsForTests();
  recordCaixaAttempt("success");
  recordCaixaRequest("success", 10, 1);
  recordCaixaAttempt("http-error");
  recordCaixaAttempt("success-after-retry");
  recordCaixaRequest("success", 20, 2);
  recordCaixaAttempt("network-error");
  recordCaixaRequest("error", 30, 1);
  recordCaixaAttempt("timeout");
  recordCaixaRequest("timeout", 40, 1);

  assert.deepEqual(caixaMetricsSnapshot(), {
    scope: "process",
    requests: 4,
    successes: 2,
    errors: 1,
    timeouts: 1,
    attempts: 5,
    retries: 1,
    recoveredAfterRetry: 1,
    finalFailures: 2,
    attemptOutcomes: {
      success: 1,
      "success-after-retry": 1,
      "http-error": 1,
      "network-error": 1,
      timeout: 1,
      "invalid-response": 0,
    },
    errorRate: 0.25,
    timeoutRate: 0.25,
    latencyMs: {
      samples: 4,
      p50: 20,
      p95: 40,
      p99: 40,
    },
  });
});

test("CAIXA metrics ignore invalid latency values without losing request outcomes", () => {
  resetCaixaMetricsForTests();
  recordCaixaRequest("error", Number.NaN);
  recordCaixaRequest("timeout", -1);

  const snapshot = caixaMetricsSnapshot();
  assert.equal(snapshot.requests, 2);
  assert.equal(snapshot.errors, 1);
  assert.equal(snapshot.timeouts, 1);
  assert.equal(snapshot.latencyMs.samples, 0);
  assert.equal(snapshot.latencyMs.p95, null);
});
