import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  combination as advancedCombination,
  exactBinomialTwoSidedP as advancedExactBinomialTwoSidedP,
  hypergeometricDistribution as advancedHypergeometricDistribution,
} from "../src/analysis/advanced.js";
import {
  combination,
  exactBinomialTwoSidedP,
  hypergeometricDistribution,
} from "../src/analysis/statistics.js";

test("advanced analysis keeps public statistical exports while delegating ownership", async () => {
  const [advanced, statistics] = await Promise.all([
    readFile("src/analysis/advanced.ts", "utf8"),
    readFile("src/analysis/statistics.ts", "utf8"),
  ]);

  assert.equal(advancedCombination, combination);
  assert.equal(advancedExactBinomialTwoSidedP, exactBinomialTwoSidedP);
  assert.equal(advancedHypergeometricDistribution, hypergeometricDistribution);

  assert.match(advanced, /from "\.\/statistics\.js"/);
  assert.match(advanced, /export \{ combination, exactBinomialTwoSidedP, hypergeometricDistribution \} from "\.\/statistics\.js"/);
  assert.doesNotMatch(advanced, /function combination\(/);
  assert.doesNotMatch(advanced, /function hypergeometricDistribution\(/);
  assert.doesNotMatch(advanced, /function binomialProbabilityTable\(/);
  assert.doesNotMatch(advanced, /function exactBinomialTwoSidedP\(/);
  assert.doesNotMatch(advanced, /function normalCdf\(/);

  assert.match(statistics, /export function combination\(/);
  assert.match(statistics, /export function hypergeometricDistribution\(/);
  assert.match(statistics, /export function exactBinomialTwoSidedP\(/);
  assert.doesNotMatch(statistics, /Contest|LotteryConfig|buildNumberAnalysis|DEFAULT_WEIGHTS|ANALYSIS_WINDOWS/);
});

test("statistical owner preserves combinatorial boundaries and normalized distributions", () => {
  assert.equal(combination(0, 0), 1);
  assert.equal(combination(5, 0), 1);
  assert.equal(combination(5, 5), 1);
  assert.equal(combination(5, 6), 0);
  assert.equal(combination(-1, 0), 0);
  assert.equal(combination(10, 3), combination(10, 7));

  for (const [population, successStates, draws] of [
    [25, 15, 15],
    [60, 6, 6],
    [31, 7, 7],
  ] as const) {
    const distribution = hypergeometricDistribution(population, successStates, draws);
    const total = distribution.reduce((sum, point) => sum + point.probability, 0);
    assert.ok(Math.abs(total - 1) < 1e-7, `${population}/${successStates}/${draws} must sum to 1`);
  }
});

test("exact two-sided binomial remains symmetric at p=0.5", () => {
  for (const observed of [0, 1, 2, 5, 8, 9, 10]) {
    assert.equal(
      exactBinomialTwoSidedP(observed, 10, 0.5),
      exactBinomialTwoSidedP(10 - observed, 10, 0.5),
    );
  }
});
