import test from "node:test";
import assert from "node:assert/strict";
import type { Contest } from "../src/domain/types.js";
import { getLotteryConfig } from "../src/lotteries/config.js";
import { evaluateRankingQuality } from "../src/analysis/rankQuality.js";
import { evaluateWalkForwardWeights } from "../src/analysis/walkForward.js";
import { pairedSignFlipNull } from "../src/analysis/nullSimulation.js";

function megaHistory(count: number): Contest[] {
  return Array.from({ length: count }, (_, index) => ({
    lottery: "mega-sena" as const,
    number: index + 1,
    date: `2026-${String((index % 8) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}`,
    numbers: Array.from({ length: 6 }, (_, offset) => ((index * 7 + offset * 11) % 60) + 1)
      .sort((a, b) => a - b),
  }));
}

test("no-score ranking has exactly random AUC because every number is tied", () => {
  const result = evaluateRankingQuality(megaHistory(80), getLotteryConfig("mega-sena"), {
    model: "no-score",
    warmupContests: 20,
  });

  assert.equal(result.auc, 0.5);
  assert.equal(result.deltaFromRandom, 0);
  assert.equal(result.meanDrawnPercentile, 0.5);
});

test("ranking quality does not leak contests after the requested evaluation period", () => {
  const original = megaHistory(90);
  const mutated = original.map((contest) => contest.number > 70
    ? { ...contest, numbers: [1, 2, 3, 4, 5, 6] }
    : contest);
  const options = { model: "score-v2" as const, warmupContests: 20, endContest: 70 };

  const first = evaluateRankingQuality(original, getLotteryConfig("mega-sena"), options);
  const second = evaluateRankingQuality(mutated, getLotteryConfig("mega-sena"), options);
  assert.deepEqual(first, second);
});

test("walk-forward freezes tuned weights inside each future block and exposes a null benchmark", () => {
  const result = evaluateWalkForwardWeights(megaHistory(150), getLotteryConfig("mega-sena"), {
    warmupContests: 20,
    trainingWindow: 50,
    validationBlock: 20,
    nullSamples: 500,
  });

  assert.ok(result.folds.length >= 3);
  assert.ok(result.totalTestRounds > 0);
  assert.equal(result.methodology.leakageProtection, true);
  assert.equal(result.methodology.parameterFreezeWithinFold, true);
  assert.equal(result.nullBenchmark.samples, 500);
  assert.ok(result.nullBenchmark.p05 <= result.nullBenchmark.p50);
  assert.ok(result.nullBenchmark.p50 <= result.nullBenchmark.p95);
});

test("paired sign-flip null simulation is deterministic", () => {
  const first = pairedSignFlipNull([0.01, -0.02, 0.03, 0.01], 400, "same-seed");
  const second = pairedSignFlipNull([0.01, -0.02, 0.03, 0.01], 400, "same-seed");
  assert.deepEqual(first, second);
});
