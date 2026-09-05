import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyHttpRoute,
  httpMetricsSnapshot,
  recordHttpRequest,
  resetHttpMetricsForTests,
} from "../src/observability/httpMetrics.js";

test("HTTP metrics classify dynamic routes into bounded families", () => {
  assert.equal(classifyHttpRoute("/health/ready"), "health");
  assert.equal(classifyHttpRoute("/api/v1/ops/metrics"), "metrics");
  assert.equal(classifyHttpRoute("/api/v1/analysis/jobs/123"), "analysis");
  assert.equal(classifyHttpRoute("/api/v1/generation/previews/abc"), "generation");
  assert.equal(classifyHttpRoute("/api/v1/game-batches/42"), "games");
  assert.equal(classifyHttpRoute("/api/v1/strategies/foo"), "strategies");
  assert.equal(classifyHttpRoute("/api/v1/operations/sync"), "operations");
  assert.equal(classifyHttpRoute("/assets/app.js"), "web");
});

test("HTTP metrics expose error rates and latency percentiles without request labels", () => {
  resetHttpMetricsForTests();
  recordHttpRequest("analysis", 200, 10);
  recordHttpRequest("analysis", 404, 20);
  recordHttpRequest("analysis", 500, 30);
  recordHttpRequest("analysis", 503, 40);

  const snapshot = httpMetricsSnapshot();
  const analysis = snapshot.families.find((family) => family.family === "analysis");

  assert.equal(snapshot.scope, "process");
  assert.equal(snapshot.latencySampleLimit, 512);
  assert.ok(analysis);
  assert.equal(analysis.requests, 4);
  assert.equal(analysis.clientErrors, 1);
  assert.equal(analysis.serverErrors, 2);
  assert.equal(analysis.clientErrorRate, 0.25);
  assert.equal(analysis.serverErrorRate, 0.5);
  assert.deepEqual(analysis.latencyMs, {
    samples: 4,
    p50: 20,
    p95: 40,
    p99: 40,
  });
  assert.deepEqual(Object.keys(analysis).sort(), [
    "clientErrorRate",
    "clientErrors",
    "family",
    "latencyMs",
    "requests",
    "serverErrorRate",
    "serverErrors",
  ]);
});

test("HTTP metrics keep a bounded rolling latency sample", () => {
  resetHttpMetricsForTests();
  for (let index = 0; index < 600; index += 1) {
    recordHttpRequest("web", 200, index);
  }

  const web = httpMetricsSnapshot().families.find((family) => family.family === "web");
  assert.ok(web);
  assert.equal(web.requests, 600);
  assert.equal(web.latencyMs.samples, 512);
  assert.equal(web.latencyMs.p99, 594);
});
