import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, LotteryId } from "../src/domain/types.js";
import {
  buildGenerationPlan,
  combinationCount,
  generationHistorySignature,
} from "../src/generator/planning.js";

function history(
  lottery: LotteryId,
  universe: number,
  drawSize: number,
  count = 40,
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

test("conditioned baseline reflects manual fixed numbers instead of reusing the lottery baseline", () => {
  const contests = history("mega-sena", 60, 6);
  const plan = buildGenerationPlan(contests, "mega-sena", {
    fixedNumbers: [1, 3, 5],
  });

  assert.equal(plan.lotteryBaseline.expectedSum, 183);
  assert.ok(Math.abs(plan.baseline.expectedSum - (9 + 3 * (1821 / 57))) < 1e-12);
  assert.ok(Math.abs(plan.baseline.expectedOdd - (3 + 3 * 27 / 57)) < 1e-12);
  assert.notEqual(plan.baseline.expectedOdd, plan.lotteryBaseline.expectedOdd);
});

test("repeat planning never substitutes an older contest when target - 1 is missing", () => {
  const contests = history("mega-sena", 60, 6, 30).filter((contest) => contest.number !== 30);
  const plan = buildGenerationPlan(contests, "mega-sena", {
    targetContestNumber: 31,
    constraints: { repeated: { min: 0, max: 2 } },
  });

  assert.equal(plan.dataQuality.previousContestAvailable, false);
  assert.equal(plan.dataQuality.missingPreviousContestNumber, 30);
  assert.equal(plan.referenceContestNumber, undefined);
  assert.equal(plan.baseline.expectedRepeated, null);
  assert.equal(plan.space.eligibleCombinations, 0);
  assert.match(plan.constraintIssues[0] ?? "", /concurso imediatamente anterior/i);
});

test("number tiers for a historical target are identical to a physically truncated history", () => {
  const full = history("mega-sena", 60, 6, 40);
  const targetPlan = buildGenerationPlan(full, "mega-sena", { targetContestNumber: 31 });
  const truncatedPlan = buildGenerationPlan(full.filter((contest) => contest.number < 31), "mega-sena");

  assert.deepEqual(targetPlan.numberTiers, truncatedPlan.numberTiers);
  assert.equal(targetPlan.historySignature, truncatedPlan.historySignature);
  assert.equal(targetPlan.historyCount, 30);
});

test("algorithm spaces expose the generator pool capacity separately from the mathematical universe", () => {
  const mega = buildGenerationPlan(history("mega-sena", 60, 6), "mega-sena");
  assert.equal(mega.algorithmSpaces["0"]?.rawCombinationCapacity, combinationCount(14, 6));
  assert.equal(mega.algorithmSpaces["3"]?.rawCombinationCapacity, combinationCount(24, 3));
  assert.equal(mega.algorithmSpaces["3"]?.shortlistLimit, 24);
  assert.equal(mega.space.eligibleCombinations, 50_063_860);

  const lotofacil = buildGenerationPlan(history("lotofacil", 25, 15), "lotofacil");
  assert.equal(lotofacil.algorithmSpaces["8"]?.rawCombinationCapacity, combinationCount(17, 7));

  const dia = buildGenerationPlan(history("dia-de-sorte", 31, 7), "dia-de-sorte");
  assert.equal(dia.algorithmSpaces["3"]?.rawCombinationCapacity, combinationCount(18, 4));
});

test("history signature invalidates retroactive corrections inside the target snapshot", () => {
  const contests = history("mega-sena", 60, 6, 30);
  const before = generationHistorySignature(contests, "mega-sena", 31);
  const corrected = contests.map((contest) => contest.number === 12
    ? { ...contest, numbers: [1, 2, 3, 4, 5, 60] }
    : contest);
  const after = generationHistorySignature(corrected, "mega-sena", 31);
  assert.notEqual(after, before);

  const futureOnly = [...contests, ...history("mega-sena", 60, 6, 5).map((contest, index) => ({
    ...contest,
    number: 31 + index,
  }))];
  assert.equal(generationHistorySignature(futureOnly, "mega-sena", 31), before);
});
