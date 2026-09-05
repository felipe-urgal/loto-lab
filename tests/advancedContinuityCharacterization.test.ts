import assert from "node:assert/strict";
import test from "node:test";
import type { Contest, LotteryId } from "../src/domain/types.js";
import { buildAdvancedAnalysis } from "../src/analysis/advanced.js";
import { getLotteryConfig } from "../src/lotteries/config.js";

function contest(lottery: LotteryId, number: number): Contest {
  const config = getLotteryConfig(lottery);
  const population = config.maxNumber - config.minNumber + 1;
  const step = lottery === "mega-sena" ? 7 : lottery === "lotofacil" ? 1 : 5;
  const offset = number - 1000;
  const numbers = Array.from({ length: config.drawSize }, (_, index) =>
    ((offset * 3 + index * step) % population) + config.minNumber,
  ).sort((a, b) => a - b);
  return {
    lottery,
    number,
    date: `2026-01-${String(((number - 1000) % 28) + 1).padStart(2, "0")}`,
    numbers,
  };
}

function range(lottery: LotteryId, start: number, end: number): Contest[] {
  return Array.from({ length: end - start + 1 }, (_, index) => contest(lottery, start + index));
}

test("rolling validation uses only the continuous suffix after an older gap", () => {
  const contests = range("lotofacil", 1000, 1059).filter((item) => item.number !== 1020);
  const result = buildAdvancedAnalysis(contests, getLotteryConfig("lotofacil"));

  assert.equal(result.dataQuality.continuous, false);
  assert.equal(result.dataQuality.missingContestCount, 1);
  assert.equal(result.dataQuality.latestContinuousContests, 39);
  assert.deepEqual(result.dataQuality.gaps, [{ after: 1019, before: 1021, missing: 1 }]);
  assert.equal(result.validation.sourceContests, 39);
  assert.equal(result.validation.availableRounds, 19);
  assert.notEqual(result.structure.metrics.repeated.current, null);
});

test("data quality counts missing contests without collapsing distinct gaps", () => {
  const contests = range("mega-sena", 1000, 1030).filter(
    (item) => ![1005, 1006, 1018, 1027, 1028, 1029].includes(item.number),
  );
  const result = buildAdvancedAnalysis(contests, getLotteryConfig("mega-sena"));

  assert.equal(result.dataQuality.continuous, false);
  assert.equal(result.dataQuality.missingContestCount, 6);
  assert.deepEqual(result.dataQuality.gaps, [
    { after: 1004, before: 1007, missing: 2 },
    { after: 1017, before: 1019, missing: 1 },
    { after: 1026, before: 1030, missing: 3 },
  ]);
  assert.equal(result.dataQuality.latestContinuousContests, 1);
  assert.equal(result.validation.sourceContests, 1);
  assert.equal(result.validation.availableRounds, 0);
  assert.equal(result.structure.metrics.repeated.current, null);
});

test("continuity is evaluated after filtering and sorting the requested lottery", () => {
  const target = range("dia-de-sorte", 1000, 1024);
  const mixed = [
    ...target.slice().reverse(),
    ...range("mega-sena", 3000, 3002),
  ];
  const result = buildAdvancedAnalysis(mixed, getLotteryConfig("dia-de-sorte"));

  assert.equal(result.historySize, 25);
  assert.equal(result.latestContest?.number, 1024);
  assert.equal(result.dataQuality.continuous, true);
  assert.equal(result.dataQuality.missingContestCount, 0);
  assert.equal(result.dataQuality.latestContinuousContests, 25);
  assert.equal(result.validation.sourceContests, 25);
  assert.equal(result.validation.availableRounds, 5);
});
