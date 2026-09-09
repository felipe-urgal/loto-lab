import assert from "node:assert/strict";
import test from "node:test";
import type { Contest } from "../src/domain/types.js";
import { buildAdvancedAnalysis } from "../src/analysis/advanced.js";
import { getLotteryConfig } from "../src/lotteries/config.js";

const config = getLotteryConfig("lotofacil");
const firstHalf = Array.from({ length: 15 }, (_, index) => index + 1);
const secondHalf = Array.from({ length: 15 }, (_, index) => index + 11);
const universe = Array.from({ length: 25 }, (_, index) => index + 1);

function contest(number: number, numbers: number[]): Contest {
  return {
    lottery: "lotofacil",
    number,
    date: `2026-01-${String(((number - 1) % 28) + 1).padStart(2, "0")}`,
    numbers,
  };
}

function cycles(contests: Contest[]) {
  return buildAdvancedAnalysis(contests, config).dynamics.cycles;
}

test("cycles keep completed history and the current partial cycle on continuous history from contest 1", () => {
  const result = cycles([
    contest(1, firstHalf),
    contest(2, secondHalf),
    contest(3, firstHalf),
  ]);

  assert.deepEqual(result, {
    available: true,
    currentLength: 1,
    seen: 15,
    missing: Array.from({ length: 10 }, (_, index) => index + 16),
    completedCount: 1,
    historicalLength: {
      mean: 2,
      min: 2,
      max: 2,
      p10: 2,
      p50: 2,
      p90: 2,
    },
  });
});

test("a gap leaves the current cycle unknown until the post-gap segment completes once", () => {
  const unknown = cycles([
    contest(1, firstHalf),
    contest(3, firstHalf),
  ]);

  assert.deepEqual(unknown, {
    available: false,
    currentLength: null,
    seen: null,
    missing: [],
    completedCount: 0,
    historicalLength: null,
  });

  const recovered = cycles([
    contest(1, firstHalf),
    contest(3, firstHalf),
    contest(4, secondHalf),
  ]);

  assert.deepEqual(recovered, {
    available: true,
    currentLength: 0,
    seen: 0,
    missing: universe,
    completedCount: 0,
    historicalLength: null,
  });

  const nextKnownCycle = cycles([
    contest(1, firstHalf),
    contest(3, firstHalf),
    contest(4, secondHalf),
    contest(5, firstHalf),
    contest(6, secondHalf),
  ]);

  assert.deepEqual(nextKnownCycle, {
    available: true,
    currentLength: 0,
    seen: 0,
    missing: universe,
    completedCount: 1,
    historicalLength: {
      mean: 2,
      min: 2,
      max: 2,
      p10: 2,
      p50: 2,
      p90: 2,
    },
  });
});

test("left-censored history uses the first observed completion only to recover a known boundary", () => {
  const unknown = cycles([
    contest(100, firstHalf),
  ]);

  assert.deepEqual(unknown, {
    available: false,
    currentLength: null,
    seen: null,
    missing: [],
    completedCount: 0,
    historicalLength: null,
  });

  const recovered = cycles([
    contest(100, firstHalf),
    contest(101, secondHalf),
  ]);

  assert.deepEqual(recovered, {
    available: true,
    currentLength: 0,
    seen: 0,
    missing: universe,
    completedCount: 0,
    historicalLength: null,
  });

  const partialKnownCycle = cycles([
    contest(100, firstHalf),
    contest(101, secondHalf),
    contest(102, firstHalf),
  ]);

  assert.deepEqual(partialKnownCycle, {
    available: true,
    currentLength: 1,
    seen: 15,
    missing: Array.from({ length: 10 }, (_, index) => index + 16),
    completedCount: 0,
    historicalLength: null,
  });

  const completedKnownCycle = cycles([
    contest(100, firstHalf),
    contest(101, secondHalf),
    contest(102, firstHalf),
    contest(103, secondHalf),
  ]);

  assert.deepEqual(completedKnownCycle, {
    available: true,
    currentLength: 0,
    seen: 0,
    missing: universe,
    completedCount: 1,
    historicalLength: {
      mean: 2,
      min: 2,
      max: 2,
      p10: 2,
      p50: 2,
      p90: 2,
    },
  });
});
