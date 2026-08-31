import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("analysis HTTP ownership delegates to application use cases", async () => {
  const [controller, app, services, routes, server] = await Promise.all([
    source("src/api/analysis.ts"),
    source("src/api/app.ts"),
    source("src/api/services.ts"),
    source("src/api/routes.ts"),
    source("src/api/server.ts"),
  ]);

  assert.doesNotMatch(controller, /PostgresContestRepository/);
  assert.doesNotMatch(controller, /options\.pool/);
  assert.match(controller, /analyzeLottery\.execute\(lottery\)/);
  assert.match(controller, /analyzeAdvancedLottery\.execute\(lottery\)/);

  assert.doesNotMatch(app, /\/api\/v1\/analysis/);
  assert.doesNotMatch(app, /services\.analyze/);

  assert.doesNotMatch(services, /new AnalyzeLotteryUseCase/);
  assert.doesNotMatch(services, /new AnalyzeAdvancedLotteryUseCase/);
  assert.doesNotMatch(services, /runAdvancedAnalysisInWorker/);

  assert.match(routes, /analyzeLottery: AnalyzeLotteryUseCase/);
  assert.match(routes, /analyzeAdvancedLottery: AnalyzeAdvancedLotteryUseCase/);
  assert.match(routes, /dependencies\.analyzeLottery/);
  assert.match(routes, /dependencies\.analyzeAdvancedLottery/);

  assert.match(server, /analyzeLottery: new AnalyzeLotteryUseCase\(contests\)/);
  assert.match(server, /analyzeAdvancedLottery: new AnalyzeAdvancedLotteryUseCase/);
  assert.match(server, /runAdvancedAnalysisInWorker/);
});
