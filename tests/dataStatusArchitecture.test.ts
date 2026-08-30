import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("data status controller delegates repository work to application", async () => {
  const [controller, application, routes, server] = await Promise.all([
    source("src/api/dataStatus.ts"),
    source("src/application/dataStatus.ts"),
    source("src/api/routes.ts"),
    source("src/api/server.ts"),
  ]);

  assert.doesNotMatch(controller, /PostgresContestRepository/);
  assert.doesNotMatch(controller, /options\.pool/);
  assert.match(controller, /dataStatus\.execute\(\)/);

  assert.doesNotMatch(application, /from "pg"/);
  assert.doesNotMatch(application, /persistence\//);
  assert.match(routes, /dataStatus: GetDataStatusUseCase/);
  assert.match(routes, /dependencies\.dataStatus/);
  assert.match(server, /const contests = new PostgresContestRepository\(options\.pool\)/);
  assert.match(server, /dataStatus: new GetDataStatusUseCase\(contests\)/);
});
