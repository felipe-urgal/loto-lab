import assert from "node:assert/strict";
import test from "node:test";
import { buildAdvancedAnalysis } from "../src/analysis/advanced.js";
import type { Contest, LotteryId } from "../src/domain/types.js";
import { getLotteryConfig } from "../src/lotteries/config.js";

type StructureFixture = {
  lottery: LotteryId;
  contests: Contest[];
  current: Record<string, unknown>;
  rules: Record<string, unknown>;
  universe: number;
  expected: {
    repeated: number;
    odd: number;
    sum: number;
    low: number;
  };
};

function contest(lottery: LotteryId, number: number, numbers: number[]): Contest {
  return {
    lottery,
    number,
    date: `2026-01-${String(number).padStart(2, "0")}`,
    numbers,
  };
}

const fixtures: StructureFixture[] = [
  {
    lottery: "mega-sena",
    contests: [
      contest("mega-sena", 1, [1, 2, 3, 4, 5, 6]),
      contest("mega-sena", 2, [1, 2, 7, 8, 9, 10]),
    ],
    current: {
      odd: 3,
      even: 3,
      sum: 37,
      repeated: 2,
      low: 6,
      high: 0,
      longestRun: 4,
    },
    rules: {
      repeated: { min: 0, max: 2, preferredMin: 0, preferredMax: 2 },
      odd: { min: 2, max: 4 },
    },
    universe: 50_063_860,
    expected: { repeated: 0.6, odd: 3, sum: 183, low: 3 },
  },
  {
    lottery: "lotofacil",
    contests: [
      contest("lotofacil", 1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
      contest("lotofacil", 2, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 16, 17, 18, 19, 20]),
    ],
    current: {
      odd: 7,
      even: 8,
      sum: 145,
      repeated: 10,
      low: 10,
      high: 5,
      longestRun: 10,
      lines: [5, 5, 0, 5, 0],
      columns: [3, 3, 3, 3, 3],
      frame: 9,
    },
    rules: {
      repeated: { min: 7, max: 11, preferredMin: 8, preferredMax: 10 },
      odd: { min: 6, max: 9 },
    },
    universe: 3_268_760,
    expected: { repeated: 9, odd: 7.8, sum: 195, low: 7.8 },
  },
  {
    lottery: "dia-de-sorte",
    contests: [
      contest("dia-de-sorte", 1, [1, 2, 3, 4, 5, 6, 7]),
      contest("dia-de-sorte", 2, [1, 8, 9, 10, 11, 12, 13]),
    ],
    current: {
      odd: 4,
      even: 3,
      sum: 64,
      repeated: 1,
      low: 7,
      high: 0,
      longestRun: 6,
    },
    rules: {
      repeated: { min: 0, max: 3, preferredMin: 1, preferredMax: 2 },
      odd: { min: 3, max: 4 },
    },
    universe: 2_629_575,
    expected: { repeated: 1.5806, odd: 3.6129, sum: 112, low: 3.6129 },
  },
];

test("advanced structure keeps lottery-specific metrics, baselines and methodology filters", () => {
  for (const fixture of fixtures) {
    const result = buildAdvancedAnalysis(fixture.contests, getLotteryConfig(fixture.lottery));
    const structure = result.structure;

    assert.deepEqual(structure.current, fixture.current, fixture.lottery);
    assert.deepEqual(structure.methodologyFilter.rules, fixture.rules, fixture.lottery);
    assert.equal(structure.methodologyFilter.exactUniverse?.total, fixture.universe, fixture.lottery);
    assert.ok((structure.methodologyFilter.exactUniverse?.coverage ?? 0) > 0, fixture.lottery);
    assert.ok((structure.methodologyFilter.exactUniverse?.coverage ?? 1) < 1, fixture.lottery);
    assert.equal(structure.methodologyFilter.historical.total, 1, fixture.lottery);
    assert.equal(structure.methodologyFilter.historical.passing, 1, fixture.lottery);
    assert.equal(structure.methodologyFilter.historical.coverage, 1, fixture.lottery);

    assert.equal(structure.metrics.repeated.expectedMean, fixture.expected.repeated, fixture.lottery);
    assert.equal(structure.metrics.odd.expectedMean, fixture.expected.odd, fixture.lottery);
    assert.equal(structure.metrics.sum.expectedMean, fixture.expected.sum, fixture.lottery);
    assert.equal(structure.metrics.low.expectedMean, fixture.expected.low, fixture.lottery);
  }
});

test("advanced structure never treats a missing predecessor as a historical transition", () => {
  const contests = [
    contest("mega-sena", 1, [1, 2, 3, 4, 5, 6]),
    contest("mega-sena", 3, [1, 2, 7, 8, 9, 10]),
  ];
  const result = buildAdvancedAnalysis(contests, getLotteryConfig("mega-sena"));

  assert.equal(result.structure.current?.repeated, null);
  assert.equal(result.structure.metrics.repeated.current, null);
  assert.equal(result.structure.methodologyFilter.historical.total, 0);
  assert.equal(result.structure.methodologyFilter.historical.passing, 0);
  assert.equal(result.structure.methodologyFilter.historical.coverage, null);
  assert.equal(result.structure.methodologyFilter.exactUniverse?.total, 50_063_860);
});
