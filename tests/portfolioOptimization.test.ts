import test from "node:test";
import assert from "node:assert/strict";
import { buildPortfolioShortlist, selectPortfolioCandidates } from "../src/generator/portfolio.js";
import { createSeededRandom, topRankedCandidates } from "../src/generator/shared.js";

function candidate(numbers: number[], rank: number, tieKey?: string) {
  return {
    numbers,
    variableNumbers: numbers,
    rank,
    ...(tieKey ? { tieKey } : {}),
  };
}

test("bounded Top-K heap returns the same ordering as a full sort", () => {
  const candidates = Array.from({ length: 200 }, (_, index) => ({
    rank: ((index * 37) % 41) - Math.floor(index / 17),
    key: String(200 - index).padStart(3, "0"),
  }));
  const compare = (a: (typeof candidates)[number], b: (typeof candidates)[number]) =>
    b.rank - a.rank || a.key.localeCompare(b.key);

  const expected = [...candidates].sort(compare).slice(0, 24);
  const actual = topRankedCandidates(candidates, 24, compare);
  assert.deepEqual(actual, expected);
});

test("portfolio shortlist keeps lower-ranked disjoint alternatives visible", () => {
  const crowded = Array.from({ length: 12 }, (_, index) => candidate([1, 2, index + 3], 100 - index));
  const disjoint = candidate([20, 21, 22], 82);
  const shortlist = buildPortfolioShortlist([...crowded, disjoint], 4, {
    explorationLimit: 32,
    diversityPenalty: 20,
  });

  assert.ok(shortlist.some((item) => item.numbers.join("-") === "20-21-22"));
});

test("portfolio optimizer trades a small local score loss for lower global overlap", () => {
  const groups = [
    [candidate([1, 2, 3], 100), candidate([1, 2, 4], 99)],
    [candidate([1, 2, 5], 100), candidate([6, 7, 8], 94)],
  ];

  const selected = selectPortfolioCandidates(groups, "deterministic", undefined, {
    overlapPenalty: 10,
    beamWidth: 32,
  });

  assert.equal(selected.length, 2);
  assert.deepEqual(selected[0]!.numbers, [1, 2, 3]);
  assert.deepEqual(selected[1]!.numbers, [6, 7, 8]);
});

test("portfolio tieKey controls deterministic ties instead of numeric game ids", () => {
  const groups = [
    [
      candidate([1, 2, 3], 100, "z"),
      candidate([40, 41, 42], 100, "a"),
    ],
  ];
  const selected = selectPortfolioCandidates(groups, "deterministic", undefined, {
    overlapPenalty: 0,
    beamWidth: 8,
  });

  assert.deepEqual(selected[0]?.numbers, [40, 41, 42]);
});

test("diversified portfolio selection is reproducible for the same seed", () => {
  const groups = [
    [candidate([1, 2], 10), candidate([3, 4], 9), candidate([5, 6], 8)],
    [candidate([7, 8], 10), candidate([9, 10], 9), candidate([11, 12], 8)],
  ];
  const first = selectPortfolioCandidates(groups, "diversified", createSeededRandom("portfolio-seed"), {
    overlapPenalty: 5,
  });
  const second = selectPortfolioCandidates(groups, "diversified", createSeededRandom("portfolio-seed"), {
    overlapPenalty: 5,
  });

  assert.deepEqual(first, second);
});
