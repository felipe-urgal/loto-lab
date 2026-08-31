import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("Generator 2.0 HTTP ownership is separated from application orchestration", async () => {
  const [application, controller, app, services, routes, server] = await Promise.all([
    source("src/application/generationV2.ts"),
    source("src/api/generationV2.ts"),
    source("src/api/app.ts"),
    source("src/api/services.ts"),
    source("src/api/routes.ts"),
    source("src/api/server.ts"),
  ]);

  assert.doesNotMatch(application, /ApiError/);
  assert.doesNotMatch(application, /LotoLabApiServices/);
  assert.doesNotMatch(application, /Postgres/);
  assert.doesNotMatch(application, /from "pg"/);
  assert.doesNotMatch(application, /planningWorkerClient/);
  assert.match(application, /interface GenerationV2HistoryReader/);
  assert.match(application, /interface GenerationV2Store/);
  assert.match(application, /type GenerationV2PlanExecutor/);

  assert.doesNotMatch(controller, /PostgresGameRepository/);
  assert.doesNotMatch(controller, /PostgresContestRepository/);
  assert.doesNotMatch(controller, /options\.pool/);
  assert.match(controller, /\/api\/v1\/generation\/plan/);
  assert.match(controller, /\/api\/v1\/generation\/preview/);
  assert.match(controller, /\/api\/v1\/generation\/save/);
  assert.match(controller, /generationV2\.plan\(/);
  assert.match(controller, /generationV2\.execute\(/);

  assert.doesNotMatch(app, /\/api\/v1\/generation\/plan/);
  assert.doesNotMatch(app, /\/api\/v1\/generation\/preview/);
  assert.doesNotMatch(app, /\/api\/v1\/generation\/save/);
  assert.doesNotMatch(app, /planGenerationV2/);
  assert.doesNotMatch(app, /runGenerationV2/);

  assert.doesNotMatch(services, /GenerationV2UseCase/);
  assert.doesNotMatch(services, /generationV2/);

  assert.match(routes, /generationV2: GenerationV2UseCase/);
  assert.match(routes, /dependencies\.generationV2/);
  assert.match(server, /generationV2: new GenerationV2UseCase\(contests, games, runGenerationPlanInWorker\)/);
});
