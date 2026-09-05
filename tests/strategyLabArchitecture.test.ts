import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("Strategy Lab delegates series/reporting ownership without moving inference", async () => {
  const [lab, reporting] = await Promise.all([
    source("src/lab/strategyLab.ts"),
    source("src/lab/strategyLabReporting.ts"),
  ]);

  assert.match(lab, /from "\.\/strategyLabReporting\.js"/);
  assert.match(lab, /buildStrategyLabVariant/);
  assert.doesNotMatch(lab, /function seriesFor/);
  assert.doesNotMatch(lab, /function toVariant/);

  assert.match(reporting, /export function buildStrategyLabSeries/);
  assert.match(reporting, /export function buildStrategyLabVariant/);
  assert.match(reporting, /summarizeBacktestRounds/);

  assert.match(lab, /evaluateRandomEvidence/);
  assert.match(lab, /evaluateRankingQuality/);
  assert.match(lab, /evaluateWalkForwardWeights/);
  assert.match(lab, /sampleRandomControls/);
});
