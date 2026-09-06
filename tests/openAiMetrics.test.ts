import assert from "node:assert/strict";
import test from "node:test";
import {
  openAiMetricsSnapshot,
  recordOpenAiRequest,
  resetOpenAiMetricsForTests,
} from "../src/observability/openAiMetrics.js";

test("OpenAI metrics aggregate fixed-cardinality outcomes, latency and complete usage", () => {
  resetOpenAiMetricsForTests();
  recordOpenAiRequest("success", 10, { input_tokens: 12, output_tokens: 4, total_tokens: 16 });
  recordOpenAiRequest("success", 20, { input_tokens: 8, output_tokens: 2, total_tokens: 10 });
  recordOpenAiRequest("error", 30);
  recordOpenAiRequest("timeout", 40);

  assert.deepEqual(openAiMetricsSnapshot(), {
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
    usage: {
      samples: 2,
      inputTokens: 20,
      outputTokens: 6,
      totalTokens: 26,
    },
  });
});

test("OpenAI metrics preserve unknown usage instead of fabricating token totals", () => {
  resetOpenAiMetricsForTests();
  recordOpenAiRequest("success", 5, { input_tokens: 12, output_tokens: 4 });
  recordOpenAiRequest("error", Number.NaN);

  const snapshot = openAiMetricsSnapshot();
  assert.equal(snapshot.requests, 2);
  assert.equal(snapshot.successes, 1);
  assert.equal(snapshot.errors, 1);
  assert.equal(snapshot.latencyMs.samples, 1);
  assert.deepEqual(snapshot.usage, {
    samples: 0,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
  });
});
