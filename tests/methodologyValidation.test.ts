import test from "node:test";
import assert from "node:assert/strict";
import type { Contest } from "../src/domain/types.js";
import { getLotteryConfig } from "../src/lotteries/config.js";
import { evaluateRankingQuality } from "../src/analysis/rankQuality.js";
import { evaluateWalkForwardWeights } from "../src/analysis/walkForward.js";
import { pairedSignFlipNull } from "../src/analysis/nullSimulation.js";
import { backtestMegaSena } from "../src/backtest/megaSena.js";

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

test("ranking quality limits the actual evaluation work to maxRounds", () => {
  const result = evaluateRankingQuality(megaHistory(120), getLotteryConfig("mega-sena"), {
    model: "score-v2",
    warmupContests: 20,
    maxRounds: 7,
  });

  assert.equal(result.rounds, 7);
  assert.equal(result.series.length, 7);
  assert.equal(result.series[0]?.contest, 114);
});

test("walk-forward freezes tuned weights inside each future block and exposes a weighted null benchmark", () => {
  const result = evaluateWalkForwardWeights(megaHistory(155), getLotteryConfig("mega-sena"), {
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
  assert.ok(Math.abs(result.nullBenchmark.observed - result.deltaVsDefault) <= 0.000001);
});

test("walk-forward does not use contests after endContest", () => {
  const original = megaHistory(150);
  const mutated = original.map((contest) => contest.number > 110
    ? { ...contest, numbers: [1, 2, 3, 4, 5, 6] }
    : contest);
  const options = {
    warmupContests: 20,
    trainingWindow: 50,
    validationBlock: 10,
    nullSamples: 200,
    startContest: 80,
    endContest: 110,
  };

  const first = evaluateWalkForwardWeights(original, getLotteryConfig("mega-sena"), options);
  const second = evaluateWalkForwardWeights(mutated, getLotteryConfig("mega-sena"), options);
  assert.deepEqual(first, second);
  assert.ok(first.folds.every((fold) => fold.testEndContest <= 110));
});

test("targets whose immediate predecessor is missing are skipped consistently", () => {
  const history = megaHistory(60).filter((contest) => contest.number !== 50);
  const quality = evaluateRankingQuality(history, getLotteryConfig("mega-sena"), {
    model: "score-v2",
    warmupContests: 20,
    startContest: 48,
    endContest: 53,
    maxRounds: 0,
  });
  const backtest = backtestMegaSena(history, {
    gameCount: 1,
    warmupContests: 20,
    startContest: 48,
    endContest: 53,
  });

  assert.ok(!quality.series.some((round) => round.contest === 51));
  assert.ok(!backtest.rounds.some((round) => round.contest === 51));
  assert.ok(quality.series.some((round) => round.contest === 52));
  assert.ok(backtest.rounds.some((round) => round.contest === 52));
});

test("paired sign-flip null simulation is deterministic and honors weights", () => {
  const first = pairedSignFlipNull([0.1, -0.1], 400, "same-seed", [9, 1]);
  const second = pairedSignFlipNull([0.1, -0.1], 400, "same-seed", [9, 1]);

  assert.deepEqual(first, second);
  assert.equal(first.observed, 0.08);
});
