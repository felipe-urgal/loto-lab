import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(path: string): Promise<string> {
  return readFile(path, "utf8");
}

test("CAIXA request metrics stay at the external boundary and expose no high-cardinality labels", async () => {
  const [caixa, metrics, server] = await Promise.all([
    source("src/data/caixa.ts"),
    source("src/observability/caixaMetrics.ts"),
    source("src/api/server.ts"),
  ]);

  assert.match(caixa, /recordCaixaRequest\("success"/);
  assert.match(caixa, /recordCaixaRequest\(timeout \? "timeout" : "error"/);
  assert.match(server, /caixa:\s*caixaMetricsSnapshot\(\)/);
  assert.match(server, /\/api\/v1\/ops\/metrics/);

  assert.doesNotMatch(metrics, /lottery|contest|pathname|requestId|url|payload|prompt/i);
  assert.match(metrics, /requests/);
  assert.match(metrics, /timeouts/);
  assert.match(metrics, /p95/);
});
