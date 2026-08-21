import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, GeneratedGame, LotteryId } from "../src/domain/types.js";
import {
  buildGenerationBatchAudit,
  buildGenerationPlan,
  combinationCount,
} from "../src/generator/planning.js";

function history(
  lottery: LotteryId,
  universe: number,
  drawSize: number,
  count = 30,
): Contest[] {
  return Array.from({ length: count }, (_, index) => {
    const step = lottery === "mega-sena" ? 11 : lottery === "lotofacil" ? 2 : 4;
    const numbers = Array.from(
      { length: drawSize },
      (_, offset) => ((index * 3 + offset * step) % universe) + 1,
    ).sort((a, b) => a - b);
    return {
      lottery,
      number: index + 1,
      date: `2026-${String((index % 8) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}`,
      numbers,
      ...(lottery === "dia-de-sorte" ? { luckyMonth: "Janeiro" } : {}),
    };
  });
}

test("combination count matches the official simple-game universes", () => {
  assert.equal(combinationCount(60, 6), 50_063_860);
  assert.equal(combinationCount(25, 15), 3_268_760);
  assert.equal(combinationCount(31, 7), 2_629_575);
});

test("Mega-Sena exact parity filter counts 3 odd plus 3 even combinations", () => {
  const plan = buildGenerationPlan(history("mega-sena", 60, 6), "mega-sena", {
    constraints: { odd: { min: 3, max: 3 } },
  });

  assert.equal(plan.baseline.totalCombinations, 50_063_860);
  assert.equal(plan.space.afterManualSelection, 50_063_860);
  assert.equal(plan.space.eligibleCombinations, 16_483_600);
  assert.equal(plan.space.overallCoverage, 16_483_600 / 50_063_860);
});

test("manual fixed and excluded numbers reduce the exact search space", () => {
  const plan = buildGenerationPlan(history("mega-sena", 60, 6), "mega-sena", {
    fixedNumbers: [1, 2],
    excludedNumbers: [3, 4, 5],
  });

  assert.equal(plan.space.afterManualSelection, combinationCount(55, 4));
  assert.equal(plan.space.eligibleCombinations, combinationCount(55, 4));
});

test("repeat filter uses the previous contest as its mathematical reference", () => {
  const plan = buildGenerationPlan(history("mega-sena", 60, 6), "mega-sena", {
    constraints: { repeated: { min: 0, max: 2 } },
  });

  assert.equal(plan.baseline.expectedRepeated, 0.6);
  assert.ok(plan.space.overallCoverage > 0.989 && plan.space.overallCoverage < 0.9905);
});

test("planning rejects conflicting manual number states", () => {
  assert.throws(
    () => buildGenerationPlan(history("dia-de-sorte", 31, 7), "dia-de-sorte", {
      fixedNumbers: [7],
      excludedNumbers: [7],
    }),
    /fixed and excluded/i,
  );
});

test("batch audit exposes shared core, coverage and pairwise overlap", () => {
  const plan = buildGenerationPlan(history("mega-sena", 60, 6), "mega-sena");
  const games: GeneratedGame[] = [
    {
      lottery: "mega-sena",
      numbers: [1, 2, 3, 10, 20, 30],
      fixedNumbers: [1, 2, 3],
      variableNumbers: [10, 20, 30],
      metadata: { odd: 3, even: 3, sum: 66, repeatedFromLastContest: [] },
    },
    {
      lottery: "mega-sena",
      numbers: [1, 2, 3, 11, 21, 31],
      fixedNumbers: [1, 2, 3],
      variableNumbers: [11, 21, 31],
      metadata: { odd: 5, even: 1, sum: 69, repeatedFromLastContest: [] },
    },
    {
      lottery: "mega-sena",
      numbers: [1, 2, 3, 10, 22, 32],
      fixedNumbers: [1, 2, 3],
      variableNumbers: [10, 22, 32],
      metadata: { odd: 2, even: 4, sum: 70, repeatedFromLastContest: [] },
    },
  ];

  const audit = buildGenerationBatchAudit(games, plan);
  assert.deepEqual(audit.sharedCore, [1, 2, 3]);
  assert.deepEqual(audit.uniqueVariableNumbers, [10, 11, 20, 21, 22, 30, 31, 32]);
  assert.equal(audit.minimumPairwiseOverlap, 3);
  assert.equal(audit.maximumPairwiseOverlap, 4);
  assert.equal(audit.averagePairwiseOverlap, 10 / 3);
});
