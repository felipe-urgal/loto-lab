import test from "node:test";
import assert from "node:assert/strict";
import {
  CaixaHttpClient,
  CaixaHttpError,
  CaixaInvalidResponseError,
  CaixaNotFoundError,
  CaixaTimeoutError,
} from "../src/data/caixaHttpClient.js";
import {
  caixaMetricsSnapshot,
  resetCaixaMetricsForTests,
} from "../src/observability/caixaMetrics.js";

function response(status: number, body: unknown = { ok: true }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("Caixa HTTP client retries 429 and 5xx with bounded exponential backoff", async () => {
  resetCaixaMetricsForTests();
  const statuses = [429, 500, 200];
  const delays: number[] = [];
  let calls = 0;
  const client = new CaixaHttpClient(
    async () => {
      const status = statuses[calls++]!;
      return response(status, { attempt: calls });
    },
    { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 250, totalTimeoutMs: 5_000 },
    async (delay) => { delays.push(delay); },
  );

  const payload = await client.getJson<{ attempt: number }>("https://example.test", "mega-sena");

  assert.deepEqual(payload, { attempt: 3 });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [100, 200]);
  const metrics = caixaMetricsSnapshot();
  assert.equal(metrics.requests, 1);
  assert.equal(metrics.attempts, 3);
  assert.equal(metrics.retries, 2);
  assert.equal(metrics.recoveredAfterRetry, 1);
  assert.equal(metrics.finalFailures, 0);
  assert.equal(metrics.attemptOutcomes["success-after-retry"], 1);
  assert.equal(metrics.attemptOutcomes["http-error"], 2);
});

test("Caixa HTTP client never retries ordinary 403 responses", async () => {
  resetCaixaMetricsForTests();
  let calls = 0;
  const delays: number[] = [];
  const client = new CaixaHttpClient(
    async () => {
      calls += 1;
      return response(403);
    },
    { maxAttempts: 3, baseDelayMs: 100, totalTimeoutMs: 5_000 },
    async (delay) => { delays.push(delay); },
  );

  await assert.rejects(
    () => client.getJson("https://example.test", "quina"),
    (error: unknown) => error instanceof CaixaHttpError && error.status === 403,
  );
  assert.equal(calls, 1);
  assert.deepEqual(delays, []);
  const metrics = caixaMetricsSnapshot();
  assert.equal(metrics.retries, 0);
  assert.equal(metrics.finalFailures, 1);
});

test("Caixa HTTP client exposes 404 as typed not-found without retry", async () => {
  let calls = 0;
  const client = new CaixaHttpClient(async () => {
    calls += 1;
    return response(404);
  }, { maxAttempts: 3, totalTimeoutMs: 5_000 }, async () => {});

  await assert.rejects(
    () => client.getJson("https://example.test", "contest 999999"),
    CaixaNotFoundError,
  );
  assert.equal(calls, 1);
});

test("Caixa HTTP client can recover after timeout and network failures", async () => {
  resetCaixaMetricsForTests();
  let calls = 0;
  const client = new CaixaHttpClient(
    async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("timed out");
        error.name = "TimeoutError";
        throw error;
      }
      if (calls === 2) throw new TypeError("socket reset");
      return response(200, { recovered: true });
    },
    { maxAttempts: 3, baseDelayMs: 0, totalTimeoutMs: 5_000 },
    async () => {},
  );

  assert.deepEqual(
    await client.getJson("https://example.test", "lotofacil"),
    { recovered: true },
  );
  const metrics = caixaMetricsSnapshot();
  assert.equal(metrics.attemptOutcomes.timeout, 1);
  assert.equal(metrics.attemptOutcomes["network-error"], 1);
  assert.equal(metrics.recoveredAfterRetry, 1);
});

test("Caixa HTTP client does not retry invalid JSON", async () => {
  let calls = 0;
  const client = new CaixaHttpClient(async () => {
    calls += 1;
    return new Response("{broken", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }, { maxAttempts: 3, totalTimeoutMs: 5_000 }, async () => {});

  await assert.rejects(
    () => client.getJson("https://example.test", "timemania"),
    CaixaInvalidResponseError,
  );
  assert.equal(calls, 1);
});

test("Caixa HTTP client fails with a typed timeout when retry budget cannot fit backoff", async () => {
  let clock = 0;
  const client = new CaixaHttpClient(
    async () => response(500),
    { maxAttempts: 3, baseDelayMs: 600, maxDelayMs: 600, totalTimeoutMs: 1_000 },
    async (delay) => { clock += delay; },
    () => clock,
  );

  await assert.rejects(
    () => client.getJson("https://example.test", "mega-sena"),
    CaixaTimeoutError,
  );
});
