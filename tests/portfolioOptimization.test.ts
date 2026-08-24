import test from "node:test";
import assert from "node:assert/strict";
import { selectPortfolioCandidates } from "../src/generator/portfolio.js";
import { createSeededRandom } from "../src/generator/shared.js";

function candidate(numbers: number[], rank: number) {
  return { numbers, variableNumbers: numbers, rank };
}

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
