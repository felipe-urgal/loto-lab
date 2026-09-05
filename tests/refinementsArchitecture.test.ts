import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("global refinements keep a thin JavaScript boundary with TypeScript ownership", async () => {
  const [boundary, owner] = await Promise.all([
    source("web/refinements.js"),
    source("web/src/features/refinements.ts"),
  ]);

  assert.equal(boundary.trim(), 'import "./src/features/refinements.js";');
  assert.doesNotMatch(boundary, /fetch\(|analysis-refinement|batch-pending|generation-strategy/);

  assert.match(owner, /import \{ api \} from "\.\.\/core\/api\.js"/);
  assert.match(owner, /currentMainView/);
  assert.match(owner, /function refineAnalysis\(\): Promise<void>/);
  assert.match(owner, /function refineGenerate\(\): void/);
  assert.match(owner, /function refineGames\(\): Promise<void>/);
  assert.doesNotMatch(owner, /fetch\(/);
});
