import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("real bet controller owns HTTP only and delegates application flow", async () => {
  const [controller, application, routes, server] = await Promise.all([
    source("src/api/realBets.ts"),
    source("src/application/realBets.ts"),
    source("src/api/routes.ts"),
    source("src/api/server.ts"),
  ]);

  assert.doesNotMatch(controller, /RealBetService/);
  assert.doesNotMatch(controller, /PostgresRealBetRepository/);
  assert.doesNotMatch(controller, /options\.pool/);
  assert.doesNotMatch(controller, /\.realBets\./);
  assert.match(controller, /realBets\.create\(/);
  assert.match(controller, /realBets\.reconcilePending\(/);
  assert.match(controller, /realBets\.check\(/);
  assert.match(controller, /realBets\.financialRevisions\(/);
  assert.match(controller, /realBets\.list\(/);

  assert.doesNotMatch(application, /from "pg"/);
  assert.doesNotMatch(application, /persistence\//);
  assert.match(routes, /realBets: RealBetUseCase/);
  assert.match(routes, /dependencies\.realBets/);
  assert.match(server, /new RealBetUseCase\(/);
  assert.match(server, /new RealBetService\(options\.pool\)/);
  assert.match(server, /new PostgresRealBetRepository\(options\.pool\)/);
});
