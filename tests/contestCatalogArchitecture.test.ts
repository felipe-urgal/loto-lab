import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("contest reads are owned by a controller and application use case", async () => {
  const [controller, application, app, routes, server] = await Promise.all([
    source("src/api/contests.ts"),
    source("src/application/contestCatalog.ts"),
    source("src/api/app.ts"),
    source("src/api/routes.ts"),
    source("src/api/server.ts"),
  ]);

  assert.doesNotMatch(controller, /PostgresContestRepository/);
  assert.doesNotMatch(controller, /options\.pool/);
  assert.match(controller, /contests\.latest\(lottery\)/);
  assert.match(controller, /contests\.findByNumber\(lottery, contestNumber\)/);
  assert.match(controller, /contests\.list\(/);

  assert.doesNotMatch(application, /from "pg"/);
  assert.doesNotMatch(application, /persistence\//);

  assert.doesNotMatch(app, /services\.contests/);
  assert.doesNotMatch(app, /\/api\/v1\/contests/);

  assert.match(routes, /contestCatalog: ContestCatalogUseCase/);
  assert.match(routes, /dependencies\.contestCatalog/);
  assert.match(server, /contestCatalog: new ContestCatalogUseCase\(contests\)/);
});
