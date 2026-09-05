import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { combinationCount } from "../src/generator/planning.js";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("generation planning delegates combinatorial space ownership", async () => {
  const [planning, space] = await Promise.all([
    source("src/generator/planning.ts"),
    source("src/generator/planningSpace.ts"),
  ]);

  assert.match(planning, /from "\.\/planningSpace\.js"/);
  assert.match(planning, /countEligibleGenerationCombinations/);
  assert.match(planning, /buildConditionalBaseline/);
  assert.match(planning, /buildGenerationAlgorithmSpaces/);
  assert.doesNotMatch(planning, /interface DpState/);
  assert.doesNotMatch(planning, /function populationStats/);

  assert.match(space, /interface DpState/);
  assert.match(space, /function populationStats/);
  assert.match(space, /export function countEligibleGenerationCombinations/);
  assert.equal(combinationCount(60, 6), 50_063_860);
});
