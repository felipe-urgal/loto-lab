import assert from "node:assert/strict";
import test from "node:test";
import type { Contest, LotteryId } from "../src/domain/types.js";
import { buildAdvancedAnalysis } from "../src/analysis/advanced.js";
import { getLotteryConfig } from "../src/lotteries/config.js";

const megaConfig = getLotteryConfig("mega-sena");
const established = [1, 2, 3, 4, 5, 6];
const lateMovers = [55, 56, 57, 58, 59, 60];

function megaContest(number: number, numbers: number[]): Contest {
  return {
    lottery: "mega-sena",
    number,
    date: `2026-01-${String(number).padStart(2, "0")}`,
    numbers,
  };
}

function dynamics(contests: Contest[]) {
  return buildAdvancedAnalysis(contests, megaConfig).ranking.dynamics;
}

function item(contests: Contest[], number: number) {
  const found = dynamics(contests).items.find((candidate) => candidate.number === number);
  assert.ok(found, `expected dynamics item for ${number}`);
  return found;
}

test("empty history keeps deterministic number tie-breaks and unknown dynamics for every lottery", () => {
  for (const lottery of ["mega-sena", "lotofacil", "dia-de-sorte"] as LotteryId[]) {
    const config = getLotteryConfig(lottery);
    const result = buildAdvancedAnalysis([], config).ranking.dynamics;
    const first = result.items[0]!;
    const last = result.items.at(-1)!;
    const universeSize = config.maxNumber - config.minNumber + 1;

    assert.equal(result.items.length, universeSize);
    assert.deepEqual(
      {
        number: first.number,
        tier: first.tier,
        rank: first.rank,
        previousRanks: first.previousRanks,
        movements: first.movements,
        trend: first.trend,
        recentTierStability: first.recentTierStability,
        recentStrongShare: first.recentStrongShare,
        weightRobustness: first.weightRobustness,
        delay: first.delay,
        streak: first.streak,
      },
      {
        number: config.minNumber,
        tier: "balanced",
        rank: 1,
        previousRanks: { one: null, five: null, ten: null, twenty: null },
        movements: { one: null, five: null, ten: null, twenty: null },
        trend: "unknown",
        recentTierStability: null,
        recentStrongShare: null,
        weightRobustness: {
          scenarioCount: 0,
          tierStability: null,
          strongShare: null,
          rankRange: [1, 1],
        },
        delay: { current: null, percentile: null, historical: null },
        streak: null,
      },
    );
    assert.equal(last.number, config.maxNumber);
    assert.equal(last.rank, universeSize);
    assert.deepEqual(last.weightRobustness.rankRange, [universeSize, universeSize]);
  }
});

test("ranking dynamics freeze offsets, movements, tiers, robustness and delay semantics", () => {
  const contests = [
    ...Array.from({ length: 20 }, (_, index) => megaContest(index + 1, established)),
    megaContest(21, lateMovers),
  ];
  const result = dynamics(contests);
  const stable = result.items.find((candidate) => candidate.number === 1)!;
  const falling = result.items.find((candidate) => candidate.number === 7)!;
  const rising = result.items.find((candidate) => candidate.number === 55)!;
  const coldTail = result.items.find((candidate) => candidate.number === 54)!;

  assert.deepEqual(
    {
      number: stable.number,
      tier: stable.tier,
      rank: stable.rank,
      previousRanks: stable.previousRanks,
      movements: stable.movements,
      trend: stable.trend,
      recentTierStability: stable.recentTierStability,
      recentStrongShare: stable.recentStrongShare,
      weightRobustness: stable.weightRobustness,
      delay: stable.delay,
      streak: stable.streak,
    },
    {
      number: 1,
      tier: "strong",
      rank: 1,
      previousRanks: { one: 1, five: 1, ten: 1, twenty: 1 },
      movements: { one: 0, five: 0, ten: 0, twenty: 0 },
      trend: "stable",
      recentTierStability: 1,
      recentStrongShare: 1,
      weightRobustness: {
        scenarioCount: 243,
        tierStability: 1,
        strongShare: 1,
        rankRange: [1, 1],
      },
      delay: {
        current: 1,
        percentile: 1,
        historical: { mean: 0, min: 0, max: 0, p10: 0, p50: 0, p90: 0 },
      },
      streak: 0,
    },
  );

  assert.deepEqual(
    {
      number: rising.number,
      tier: rising.tier,
      rank: rising.rank,
      previousRanks: rising.previousRanks,
      movements: rising.movements,
      trend: rising.trend,
      recentTierStability: rising.recentTierStability,
      recentStrongShare: rising.recentStrongShare,
      weightRobustness: rising.weightRobustness,
      delay: rising.delay,
      streak: rising.streak,
    },
    {
      number: 55,
      tier: "cold",
      rank: 7,
      previousRanks: { one: 55, five: 55, ten: 55, twenty: 55 },
      movements: { one: 48, five: 48, ten: 48, twenty: 48 },
      trend: "rising",
      recentTierStability: 1,
      recentStrongShare: 0,
      weightRobustness: {
        scenarioCount: 243,
        tierStability: 0,
        strongShare: 1,
        rankRange: [7, 7],
      },
      delay: { current: 0, percentile: null, historical: null },
      streak: 1,
    },
  );

  assert.deepEqual(
    {
      number: falling.number,
      tier: falling.tier,
      rank: falling.rank,
      previousRanks: falling.previousRanks,
      movements: falling.movements,
      trend: falling.trend,
      recentTierStability: falling.recentTierStability,
      recentStrongShare: falling.recentStrongShare,
      weightRobustness: falling.weightRobustness,
      delay: falling.delay,
      streak: falling.streak,
    },
    {
      number: 7,
      tier: "cold",
      rank: 13,
      previousRanks: { one: 7, five: 7, ten: 7, twenty: 7 },
      movements: { one: -6, five: -6, ten: -6, twenty: -6 },
      trend: "falling",
      recentTierStability: 1,
      recentStrongShare: 0,
      weightRobustness: {
        scenarioCount: 243,
        tierStability: 0,
        strongShare: 1,
        rankRange: [13, 13],
      },
      delay: { current: 21, percentile: null, historical: null },
      streak: 0,
    },
  );

  assert.deepEqual(coldTail.weightRobustness, {
    scenarioCount: 243,
    tierStability: 1,
    strongShare: 0,
    rankRange: [60, 60],
  });

  assert.deepEqual(result.movers.rising, [55, 56, 57, 58, 59, 60].map((number, index) => ({
    number,
    movement: 48,
    rank: 7 + index,
  })));
  assert.deepEqual(result.movers.falling, [54, 53, 52, 51, 50, 49, 48, 47].map((number, index) => ({
    number,
    movement: -6,
    rank: 60 - index,
  })));
});

test("gaps keep delay and streak boundaries explicit instead of bridging unknown history", () => {
  const contests = [
    megaContest(1, established),
    megaContest(2, established),
    megaContest(4, established),
    megaContest(5, established),
  ];
  const present = item(contests, 1);
  const absent = item(contests, 7);

  assert.deepEqual(present.delay, {
    current: 0,
    percentile: 1,
    historical: { mean: 0, min: 0, max: 0, p10: 0, p50: 0, p90: 0 },
  });
  assert.equal(present.streak, null);

  assert.deepEqual(absent.delay, { current: null, percentile: null, historical: null });
  assert.equal(absent.streak, 0);
});
