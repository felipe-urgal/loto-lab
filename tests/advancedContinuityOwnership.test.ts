import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(path: string): Promise<string> {
  return readFile(path, "utf8");
}

test("advanced analysis delegates continuity and data quality to one internal owner", async () => {
  const [advanced, continuity] = await Promise.all([
    source("src/analysis/advanced.ts"),
    source("src/analysis/continuity.ts"),
  ]);

  assert.match(advanced, /from "\.\/continuity\.js"/);
  assert.doesNotMatch(advanced, /function isConsecutive\(/);
  assert.doesNotMatch(advanced, /function splitContinuousSegments\(/);
  assert.doesNotMatch(advanced, /function latestContinuousSegment\(/);
  assert.doesNotMatch(advanced, /function buildDataQuality\(/);

  assert.match(continuity, /export function isConsecutive\(/);
  assert.match(continuity, /export function splitContinuousSegments\(/);
  assert.match(continuity, /export function latestContinuousSegment\(/);
  assert.match(continuity, /export function buildDataQuality\(/);
  assert.doesNotMatch(continuity, /LotteryConfig|buildNumberAnalysis|score|pValue|weights/i);
});
