import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(path: string): Promise<string> {
  return readFile(path, "utf8");
}

test("operational metrics compose PostgreSQL pool pressure in the authenticated server boundary", async () => {
  const [server, metrics] = await Promise.all([
    source("src/api/server.ts"),
    source("src/observability/postgresPoolMetrics.ts"),
  ]);

  assert.match(server, /postgresPoolMetricsSnapshot/);
  assert.match(server, /postgres:\s*postgresPoolMetricsSnapshot\(options\.pool\)/);
  assert.match(server, /\/api\/v1\/ops\/metrics/);

  assert.doesNotMatch(metrics, /SELECT|query\(|pathname|requestId|lottery|prompt/i);
  assert.match(metrics, /waitingRequests/);
  assert.match(metrics, /activeConnections/);
});
