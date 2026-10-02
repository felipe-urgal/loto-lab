import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(path: string): Promise<string> {
  return readFile(path, "utf8");
}

test("CAIXA request metrics stay at the external boundary and expose no high-cardinality labels", async () => {
  const [caixa, httpClient, metrics, server] = await Promise.all([
    source("src/data/caixa.ts"),
    source("src/data/caixaHttpClient.ts"),
    source("src/observability/caixaMetrics.ts"),
    source("src/api/server.ts"),
  ]);

  assert.match(caixa, /CaixaHttpClient/);
  assert.match(httpClient, /recordCaixaRequest/);
  assert.match(httpClient, /recordCaixaAttempt/);
  assert.match(httpClient, /success-after-retry/);
  assert.match(server, /caixa:\s*caixaMetricsSnapshot\(\)/);
  assert.match(server, /\/api\/v1\/ops\/metrics/);

  assert.doesNotMatch(metrics, /lottery|contest|pathname|requestId|url|payload|prompt/i);
  assert.match(metrics, /requests/);
  assert.match(metrics, /timeouts/);
  assert.match(metrics, /retries/);
  assert.match(metrics, /recoveredAfterRetry/);
  assert.match(metrics, /p95/);
});
