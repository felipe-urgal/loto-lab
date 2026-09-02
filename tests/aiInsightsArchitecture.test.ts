import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("AI HTTP ownership delegates to an injected application use case", async () => {
  const [application, controller, routes, server] = await Promise.all([
    source("src/application/aiInsights.ts"),
    source("src/api/aiInsights.ts"),
    source("src/api/routes.ts"),
    source("src/api/server.ts"),
  ]);

  assert.doesNotMatch(application, /from "pg"/);
  assert.doesNotMatch(application, /Postgres/);
  assert.doesNotMatch(application, /\.\.\/persistence\//);
  assert.match(application, /interface AiEvidenceReader/);
  assert.match(application, /interface AiInsightStore/);
  assert.match(application, /class AiInsightsUseCase/);

  assert.doesNotMatch(controller, /AiInsightService/);
  assert.doesNotMatch(controller, /OpenAiInterpretationProvider/);
  assert.doesNotMatch(controller, /PostgresAiInsightRepository/);
  assert.doesNotMatch(controller, /options\.pool/);
  assert.doesNotMatch(controller, /from "pg"/);
  assert.match(controller, /aiInsights\.status\(/);
  assert.match(controller, /aiInsights\.generate\(/);
  assert.match(controller, /aiInsights\.history\(/);

  assert.match(routes, /aiInsights: AiInsightsUseCase/);
  assert.match(routes, /dependencies\.aiInsights/);
  assert.match(server, /aiInsights: new AiInsightsUseCase\(/);
  assert.match(server, /new PostgresAiInsightRepository\(options\.pool\)/);
  assert.match(server, /new OpenAiInterpretationProvider\(\)/);
});
