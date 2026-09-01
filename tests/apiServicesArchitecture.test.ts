import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("legacy API services module no longer owns infrastructure composition", async () => {
  const [services, index, server] = await Promise.all([
    source("src/api/services.ts"),
    source("src/index.ts"),
    source("src/api/server.ts"),
  ]);

  assert.doesNotMatch(services, /class LotoLabApiServices/);
  assert.doesNotMatch(services, /from "pg"/);
  assert.doesNotMatch(services, /\.\.\/persistence\//);
  assert.doesNotMatch(services, /new Postgres/);

  assert.match(index, /export \* from "\.\/api\/services\.js"/);
  assert.match(server, /const contests = new PostgresContestRepository\(options\.pool\)/);
  assert.match(server, /const games = new PostgresGameRepository\(options\.pool\)/);
  assert.doesNotMatch(server, /LotoLabApiServices/);
});
