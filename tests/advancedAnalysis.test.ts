import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, LotteryId } from "../src/domain/types.js";
import { buildAdvancedAnalysis, combination, hypergeometricDistribution } from "../src/analysis/advanced.js";
import { getLotteryConfig } from "../src/lotteries/config.js";

function syntheticContests(lottery: LotteryId, count: number): Contest[] {
  const config = getLotteryConfig(lottery);
  const population = config.maxNumber - config.minNumber + 1;
  return Array.from({ length: count }, (_, index) => {
    const step = lottery === "mega-sena" ? 7 : lottery === "lotofacil" ? 1 : 5;
    const numbers = Array.from({ length: config.drawSize }, (_, offset) =>
      ((index * 3 + offset * step) % population) + config.minNumber,
    ).sort((a, b) => a - b);
    return {
      lottery,
      number: 1000 + index,
      date: `2026-${String((Math.floor(index / 28) % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
      numbers,
    };
  });
}

test("combinatorial helpers reproduce known lottery universe sizes and overlap means", () => {
  assert.equal(combination(25, 15), 3_268_760);
  assert.equal(combination(60, 6), 50_063_860);
  assert.equal(combination(31, 7), 2_629_575);

  const lotofacil = hypergeometricDistribution(25, 15, 15);
  const lotofacilMean = lotofacil.reduce((sum, point) => sum + point.value * point.probability, 0);
  const preferred = lotofacil
    .filter((point) => point.value >= 8 && point.value <= 10)
    .reduce((sum, point) => sum + point.probability, 0);
  assert.ok(Math.abs(lotofacilMean - 9) < 1e-6);
  assert.ok(preferred > 0.78 && preferred < 0.80);

  const mega = hypergeometricDistribution(60, 6, 6);
  const megaNaturalRange = mega
    .filter((point) => point.value <= 2)
    .reduce((sum, point) => sum + point.probability, 0);
  assert.ok(megaNaturalRange > 0.98);
});

test("advanced Lotofacil analysis compares observed structure with exact mathematical baselines", () => {
  const result = buildAdvancedAnalysis(syntheticContests("lotofacil", 80), getLotteryConfig("lotofacil"));

  assert.equal(result.model.baseline, "uniform-without-replacement");
  assert.equal(result.ranking.dynamics.items.length, 25);
  assert.equal(result.ranking.dynamics.items[0]?.weightRobustness.scenarioCount, 243);
  assert.equal(result.structure.metrics.repeated.expectedMean, 9);
  assert.ok(result.structure.metrics.frame, "Lotofacil analysis must expose the frame metric");
  assert.equal(result.structure.metrics.frame?.expectedMean, 9.6);
  assert.ok((result.structure.metrics.odd.expectedMean ?? 0) > 7.7);
  assert.ok((result.structure.metrics.odd.expectedMean ?? 0) < 7.9);
  assert.equal(result.structure.methodologyFilter.exactUniverse.total, 3_268_760);
  assert.ok(result.structure.methodologyFilter.exactUniverse.coverage > 0);
  assert.ok(result.structure.methodologyFilter.exactUniverse.coverage < 1);
  assert.deepEqual(result.structure.methodologyFilter.rules.repeated, {
    min: 7,
    max: 11,
    preferredMin: 8,
    preferredMax: 10,
  });

  assert.equal(result.combinations.pairs.length, 300);
  assert.equal(result.combinations.methodology.pairComparisons, 300);
  assert.equal(result.combinations.methodology.tripleComparisons, 2300);
  assert.ok(result.similarity.closest.length > 0);

  assert.equal(result.validation.availableRounds, 60);
  assert.equal(result.validation.periods[0]?.rounds, 60);
  assert.equal(result.validation.methodology.leakageProtection, true);
  assert.equal(
    result.validation.periods[0]?.tiers.reduce((sum, tier) => sum + tier.observedHits, 0),
    60 * 15,
  );
});

test("advanced analysis degrades safely with no history", () => {
  const result = buildAdvancedAnalysis([], getLotteryConfig("mega-sena"));
  assert.equal(result.latestContest, null);
  assert.equal(result.historySize, 0);
  assert.equal(result.ranking.dynamics.items.length, 60);
  assert.equal(result.validation.availableRounds, 0);
  assert.equal(result.dynamics.heatmap.length, 0);
  assert.equal(result.structure.current, null);
});
