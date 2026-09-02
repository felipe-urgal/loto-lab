import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("analysis jobs HTTP ownership delegates to an injected application use case", async () => {
  const [application, strategyLabInput, apiStrategyLabInput, controller, routes, server, startup] = await Promise.all([
    source("src/application/analysisJobs.ts"),
    source("src/application/strategyLabInput.ts"),
    source("src/api/strategyLabInput.ts"),
    source("src/api/analysisJobs.ts"),
    source("src/api/routes.ts"),
    source("src/api/server.ts"),
    source("src/cli/apiStart.ts"),
  ]);

  assert.doesNotMatch(application, /from "pg"/);
  assert.doesNotMatch(application, /Postgres/);
  assert.doesNotMatch(application, /\.\.\/persistence\//);
  assert.doesNotMatch(application, /\.\.\/api\//);
  assert.match(application, /interface AnalysisJobQueue/);
  assert.match(application, /interface AnalysisJobStrategyReader/);
  assert.match(application, /interface AnalysisJobHistoryReader/);
  assert.match(application, /class AnalysisJobsUseCase/);
  assert.match(application, /from "\.\/strategyLabInput\.js"/);
  assert.doesNotMatch(application, /function parseStrategyLabExperiment/);

  assert.doesNotMatch(strategyLabInput, /\.\.\/api\//);
  assert.doesNotMatch(strategyLabInput, /from "pg"/);
  assert.match(strategyLabInput, /export function parseStrategyLabOptions/);
  assert.match(apiStrategyLabInput, /from "\.\.\/application\/strategyLabInput\.js"/);
  assert.doesNotMatch(apiStrategyLabInput, /function parsePositiveInt/);

  assert.doesNotMatch(controller, /getAnalysisJobManager/);
  assert.doesNotMatch(controller, /PostgresContestRepository/);
  assert.doesNotMatch(controller, /PostgresStrategyRepository/);
  assert.doesNotMatch(controller, /options\.pool/);
  assert.doesNotMatch(controller, /from "pg"/);
  assert.match(controller, /analysisJobs\.enqueue\(/);
  assert.match(controller, /analysisJobs\.list\(/);
  assert.match(controller, /analysisJobs\.findById\(/);
  assert.match(controller, /analysisJobs\.cancel\(/);

  assert.match(routes, /analysisJobs: AnalysisJobsUseCase/);
  assert.match(routes, /dependencies\.analysisJobs/);
  assert.match(server, /analysisJobs: new AnalysisJobsUseCase\(/);
  assert.match(server, /getAnalysisJobManager\(options\.pool\)/);
  assert.match(server, /strategies,[\s\S]*contests/);

  assert.match(startup, /analysisJobs = getAnalysisJobManager\(pool\)/);
  assert.match(startup, /await analysisJobs\.start\(\)/);
  assert.match(startup, /analysisJobs\?\.stopAndDrain\(\)/);
});
