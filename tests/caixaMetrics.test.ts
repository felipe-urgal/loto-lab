import assert from "node:assert/strict";
import test from "node:test";
import {
  caixaMetricsSnapshot,
  recordCaixaRequest,
  resetCaixaMetricsForTests,
} from "../src/observability/caixaMetrics.js";

test("CAIXA metrics aggregate fixed-cardinality outcomes and bounded latency percentiles", () => {
  resetCaixaMetricsForTests();
  recordCaixaRequest("success", 10);
  recordCaixaRequest("success", 20);
  recordCaixaRequest("error", 30);
  recordCaixaRequest("timeout", 40);

  assert.deepEqual(caixaMetricsSnapshot(), {
    scope: "process",
    requests: 4,
    successes: 2,
    errors: 1,
    timeouts: 1,
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
