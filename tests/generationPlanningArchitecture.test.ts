import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { combinationCount } from "../src/generator/planning.js";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("generation planning delegates combinatorial space and validation ownership", async () => {
  const [planning, space, constraints] = await Promise.all([
    source("src/generator/planning.ts"),
    source("src/generator/planningSpace.ts"),
    source("src/generator/planningConstraints.ts"),
  ]);

  assert.match(planning, /from "\.\/planningSpace\.js"/);
  assert.match(planning, /from "\.\/planningConstraints\.js"/);
  assert.match(planning, /countEligibleGenerationCombinations/);
  assert.match(planning, /buildConditionalBaseline/);
  assert.match(planning, /buildGenerationAlgorithmSpaces/);
  assert.match(planning, /validateGenerationSelection/);
  assert.match(planning, /validateGenerationConstraints/);
  assert.doesNotMatch(planning, /interface DpState/);
  assert.doesNotMatch(planning, /function populationStats/);
  assert.doesNotMatch(planning, /function assertRange/);
  assert.doesNotMatch(planning, /Selected numbers must/);

  assert.match(space, /interface DpState/);
  assert.match(space, /function populationStats/);
  assert.match(space, /export function countEligibleGenerationCombinations/);
  assert.match(constraints, /export function validateGenerationSelection/);
  assert.match(constraints, /export function validateGenerationConstraints/);
  assert.match(constraints, /Selected numbers must/);
  assert.match(constraints, /must be an integer range between/);
  assert.equal(combinationCount(60, 6), 50_063_860);
});
