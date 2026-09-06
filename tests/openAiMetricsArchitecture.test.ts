import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(path: string): Promise<string> {
  return readFile(path, "utf8");
}

test("OpenAI observability stays at the provider boundary without sensitive labels", async () => {
  const [provider, metrics, server] = await Promise.all([
    source("src/ai/openai.ts"),
    source("src/observability/openAiMetrics.ts"),
    source("src/api/server.ts"),
  ]);

  assert.match(provider, /recordOpenAiRequest\(timeout \? "timeout" : "error"/);
  assert.match(provider, /recordOpenAiRequest\("success"/);
  assert.match(server, /openai:\s*openAiMetricsSnapshot\(\)/);
  assert.match(server, /\/api\/v1\/ops\/metrics/);

  assert.doesNotMatch(metrics, /prompt|apiKey|requestId|lottery|providerResponseId|responseText/i);
  assert.match(metrics, /requests/);
  assert.match(metrics, /timeouts/);
  assert.match(metrics, /inputTokens/);
  assert.match(metrics, /p95/);
});
