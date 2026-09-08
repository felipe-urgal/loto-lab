import assert from "node:assert/strict";
import test from "node:test";
import { buildAdvancedAnalysis } from "../src/analysis/advanced.js";
import type { Contest, LotteryId } from "../src/domain/types.js";
import { getLotteryConfig } from "../src/lotteries/config.js";

type AssociationExpectation = {
  numbers: number[];
  observed: number;
  expected: number;
  lift: number;
  zScore: number;
  pValue: number;
  adjustedPValue: number;
  evidence: "none" | "weak" | "moderate";
};

type AssociationFixture = {
  lottery: LotteryId;
  pairComparisons: number;
  tripleComparisons: number;
  positivePair: AssociationExpectation;
  negativePair: AssociationExpectation;
  positiveTriple: AssociationExpectation;
};

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

const fixtures: AssociationFixture[] = [
  {
    lottery: "mega-sena",
    pairComparisons: 1770,
    tripleComparisons: 34220,
    positivePair: {
      numbers: [22, 29],
      observed: 4,
      expected: 0.2542,
      lift: 15.7333,
      zScore: 7.4605,
      pValue: 0.0001185127,
      adjustedPValue: 0.2097673957,
      evidence: "none",
    },
    negativePair: {
      numbers: [1, 2],
      observed: 0,
      expected: 0.2542,
      lift: 0,
      zScore: -0.5064,
      pValue: 1,
      adjustedPValue: 1,
      evidence: "none",
    },
    positiveTriple: {
      numbers: [22, 29, 36],
      observed: 4,
      expected: 0.0175,
      lift: 228.1333,
      zScore: 30.0845,
      pValue: 3.2e-9,
      adjustedPValue: 0.0001081011,
      evidence: "moderate",
    },
  },
  {
    lottery: "lotofacil",
    pairComparisons: 300,
    tripleComparisons: 2300,
    positivePair: {
      numbers: [13, 14],
      observed: 19,
      expected: 10.5,
      lift: 1.8095,
      zScore: 3.2536,
      pValue: 0.0017968754,
      adjustedPValue: 0.5390626232,
      evidence: "none",
    },
    negativePair: {
      numbers: [3, 16],
      observed: 5,
      expected: 10.5,
      lift: 0.4762,
      zScore: -2.1053,
      pValue: 0.0356197084,
      adjustedPValue: 1,
      evidence: "none",
    },
    positiveTriple: {
      numbers: [13, 14, 15],
      observed: 18,
      expected: 5.9348,
      lift: 3.033,
      zScore: 5.5297,
      pValue: 0.0000015598,
      adjustedPValue: 0.0035874376,
      evidence: "moderate",
    },
  },
  {
    lottery: "dia-de-sorte",
    pairComparisons: 465,
    tripleComparisons: 4495,
    positivePair: {
      numbers: [1, 6],
      observed: 6,
      expected: 1.3548,
      lift: 4.4286,
      zScore: 4.0841,
      pValue: 0.0019724472,
      adjustedPValue: 0.9171879555,
      evidence: "none",
    },
    negativePair: {
      numbers: [1, 3],
      observed: 0,
      expected: 1.3548,
      lift: 0,
      zScore: -1.1912,
      pValue: 0.6453025256,
      adjustedPValue: 1,
      evidence: "none",
    },
    positiveTriple: {
      numbers: [1, 6, 11],
      observed: 5,
      expected: 0.2336,
      lift: 21.4048,
      zScore: 9.9005,
      pValue: 0.0000034674,
      adjustedPValue: 0.015586024,
      evidence: "weak",
    },
  },
];

test("advanced associations preserve pair/triple inference and Bonferroni correction across lotteries", () => {
  for (const fixture of fixtures) {
    const result = buildAdvancedAnalysis(syntheticContests(fixture.lottery, 30), getLotteryConfig(fixture.lottery));
    const combinations = result.combinations;

    assert.equal(combinations.pairs.length, fixture.pairComparisons, fixture.lottery);
    assert.equal(combinations.methodology.pairComparisons, fixture.pairComparisons, fixture.lottery);
    assert.equal(combinations.methodology.tripleComparisons, fixture.tripleComparisons, fixture.lottery);
    assert.equal(combinations.methodology.test, "exact-binomial-two-sided", fixture.lottery);
    assert.equal(combinations.methodology.correction, "bonferroni", fixture.lottery);
    assert.match(combinations.methodology.note, /exploratórias/i, fixture.lottery);

    assert.deepEqual(combinations.highlights.positivePairs[0], fixture.positivePair, fixture.lottery);
    assert.deepEqual(combinations.highlights.negativePairs[0], fixture.negativePair, fixture.lottery);
    assert.deepEqual(combinations.highlights.positiveTriples[0], fixture.positiveTriple, fixture.lottery);
    assert.equal(combinations.highlights.positivePairs.length, 12, fixture.lottery);
    assert.equal(combinations.highlights.negativePairs.length, 12, fixture.lottery);
    assert.equal(combinations.highlights.positiveTriples.length, 12, fixture.lottery);
  }
});
