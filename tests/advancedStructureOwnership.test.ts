import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("advanced analysis delegates structural methodology to one internal owner", async () => {
  const [advanced, structure] = await Promise.all([
    readFile("src/analysis/advanced.ts", "utf8"),
    readFile("src/analysis/structure.ts", "utf8"),
  ]);

  assert.match(advanced, /from "\.\/structure\.js"/);
  for (const helper of [
    "longestConsecutiveRun",
    "lotofacilGrid",
    "structuralMetric",
    "methodologyRanges",
    "exactFilterCoverage",
  ]) {
    assert.doesNotMatch(advanced, new RegExp(`function ${helper}\\(`));
  }
  assert.doesNotMatch(advanced, /function structureForContest\(/);
  assert.doesNotMatch(advanced, /function buildStructure\(/);

  assert.match(structure, /export function structureForContest\(/);
  assert.match(structure, /export function buildStructure\(/);
  assert.match(structure, /function longestConsecutiveRun\(/);
  assert.match(structure, /function lotofacilGrid\(/);
  assert.match(structure, /function structuralMetric\(/);
  assert.match(structure, /function methodologyRanges\(/);
  assert.match(structure, /function exactFilterCoverage\(/);

  assert.doesNotMatch(
    structure,
    /buildNumberAnalysis|DEFAULT_WEIGHTS|ANALYSIS_WINDOWS|buildRollingValidation|buildAssociations/,
  );
});
