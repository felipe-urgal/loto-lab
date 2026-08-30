import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("operations controller delegates persistence and sync orchestration to application", async () => {
  const [controller, routes, server] = await Promise.all([
    source("src/api/operations.ts"),
    source("src/api/routes.ts"),
    source("src/api/server.ts"),
  ]);

  assert.doesNotMatch(controller, /from "pg"/);
  assert.doesNotMatch(controller, /PostgresOperationRepository/);
  assert.doesNotMatch(controller, /runOperationalSync/);
  assert.match(controller, /operations\.status\(/);
  assert.match(controller, /operations\.sync\(\)/);

  assert.match(routes, /operations: OperationsUseCase/);
  assert.match(routes, /dependencies\.operations/);
  assert.match(server, /new OperationsUseCase\(/);
  assert.match(server, /new PostgresOperationRepository\(options\.pool\)/);
});
