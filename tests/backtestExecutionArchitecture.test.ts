import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("active backtest execution is owned by the feature controller and application use case", async () => {
  const [controller, application, routes, server, workerClient] = await Promise.all([
    source("src/api/backtests.ts"),
    source("src/application/executeBacktest.ts"),
    source("src/api/routes.ts"),
    source("src/api/server.ts"),
    source("src/api/workerClient.ts"),
  ]);

  assert.match(controller, /executeBacktest\.execute/);
  assert.doesNotMatch(controller, /expensiveAnalysisGate/);
  assert.doesNotMatch(application, /from "pg"/);
  assert.doesNotMatch(application, /persistence\//);
  assert.doesNotMatch(application, /api\//);
  assert.match(routes, /executeBacktest: ExecuteBacktestUseCase/);
  assert.match(routes, /dependencies\.executeBacktest/);
  assert.match(server, /new ExecuteBacktestUseCase/);
  assert.match(server, /runBacktestInWorker/);
  assert.doesNotMatch(server, /new LotoLabApiServices/);
  assert.doesNotMatch(workerClient, /from "\.\/services\.js"/);
  assert.match(workerClient, /services: BacktestWorkerServices/);
});
