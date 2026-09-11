import assert from "node:assert/strict";
import test from "node:test";
import { buildAdvancedAnalysis } from "../src/analysis/advanced.js";
import { buildNumberAnalysis } from "../src/analysis/scoring.js";
import type { Contest, LotteryId, NumberTier } from "../src/domain/types.js";
import { getLotteryConfig } from "../src/lotteries/config.js";

function syntheticContests(lottery: LotteryId, count: number, start = 1): Contest[] {
  const config = getLotteryConfig(lottery);
  const population = config.maxNumber - config.minNumber + 1;
  return Array.from({ length: count }, (_, index) => {
    const absolute = start + index;
    const step = lottery === "mega-sena" ? 7 : lottery === "lotofacil" ? 1 : 5;
    const numbers = Array.from({ length: config.drawSize }, (_, offset) =>
      ((index * 3 + offset * step) % population) + config.minNumber,
    ).sort((a, b) => a - b);
    return {
      lottery,
      number: absolute,
      date: `2026-${String((Math.floor(index / 28) % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
      numbers,
    };
  });
}

function hitsByTier(rows: ReturnType<typeof buildNumberAnalysis>, target: Contest) {
  const tiers = new Map(rows.map((row) => [row.number, row.tier]));
  const hits: Record<NumberTier, number> = { strong: 0, balanced: 0, cold: 0 };
  for (const number of target.numbers) {
    const tier = tiers.get(number);
    if (tier) hits[tier] += 1;
  }
  return hits;
}

test("rolling validation preserves warmup and public methodology metadata", () => {
  for (const lottery of ["mega-sena", "lotofacil", "dia-de-sorte"] as const) {
    const config = getLotteryConfig(lottery);
    const beforeWarmup = buildAdvancedAnalysis(syntheticContests(lottery, 20), config).validation;
    const firstRound = buildAdvancedAnalysis(syntheticContests(lottery, 21), config).validation;

    assert.equal(beforeWarmup.sourceContests, 20);
    assert.equal(beforeWarmup.availableRounds, 0);
    assert.deepEqual(beforeWarmup.periods.map((period) => [period.window, period.rounds]), [
      [100, 0],
      [300, 0],
      [500, 0],
    ]);

    assert.equal(firstRound.sourceContests, 21);
    assert.equal(firstRound.availableRounds, 1);
    assert.deepEqual(firstRound.periods.map((period) => [period.window, period.rounds]), [
      [100, 1],
      [300, 1],
      [500, 1],
    ]);
    assert.equal(firstRound.methodology.warmupContests, 20);
    assert.equal(firstRound.methodology.leakageProtection, true);
    assert.equal(firstRound.methodology.requiresContinuousHistory, true);
    assert.equal(firstRound.methodology.correction, "bonferroni-9-tests");
    assert.match(firstRound.methodology.note, /apenas concursos anteriores/);
  }
});

test("rolling validation classifies each target from prefix-only history", () => {
  const config = getLotteryConfig("mega-sena");
  const recurring = [1, 2, 3, 4, 5, 6];
  const targetNumbers = [55, 56, 57, 58, 59, 60];
  const target: Contest = {
    lottery: "mega-sena",
    number: 21,
    date: "2026-01-21",
    numbers: targetNumbers,
  };
  let fixture: {
    history: Contest[];
    prefixHits: Record<NumberTier, number>;
    leakedHits: Record<NumberTier, number>;
  } | undefined;

  for (let priorTargetDraws = 0; priorTargetDraws <= 20; priorTargetDraws += 1) {
    const history: Contest[] = Array.from({ length: 20 }, (_, index) => ({
      lottery: "mega-sena",
      number: index + 1,
      date: `2026-01-${String(index + 1).padStart(2, "0")}`,
      numbers: index < priorTargetDraws ? targetNumbers : recurring,
    }));
    const prefixHits = hitsByTier(buildNumberAnalysis(history, config), target);
    const leakedHits = hitsByTier(buildNumberAnalysis([...history, target], config), target);
    const differs = (["strong", "balanced", "cold"] as const)
      .some((tier) => prefixHits[tier] !== leakedHits[tier]);
    if (differs) {
      fixture = { history, prefixHits, leakedHits };
      break;
    }
  }

  if (!fixture) assert.fail("deterministic fixture must distinguish prefix-only from leaked classification");
  assert.notDeepEqual(fixture.prefixHits, fixture.leakedHits);

  const validation = buildAdvancedAnalysis([...fixture.history, target], config).validation;
  assert.equal(validation.availableRounds, 1);
  for (const period of validation.periods) {
    assert.deepEqual(
      Object.fromEntries(period.tiers.map((tier) => [tier.tier, tier.observedHits])),
      fixture.prefixHits,
    );
  }
});

test("rolling validation caps reported windows at 100, 300 and 500 rounds", () => {
  const config = getLotteryConfig("mega-sena");
  const validation = buildAdvancedAnalysis(syntheticContests("mega-sena", 520), config).validation;

  assert.equal(validation.sourceContests, 520);
  assert.equal(validation.availableRounds, 500);
  assert.deepEqual(validation.periods.map((period) => [period.window, period.rounds]), [
    [100, 100],
    [300, 300],
    [500, 500],
  ]);
});

test("rolling validation uses only the latest continuous segment after a gap", () => {
  const config = getLotteryConfig("mega-sena");
  const full = syntheticContests("mega-sena", 30);
  const withGap = full.filter((contest) => contest.number !== 5);
  const suffix = full.slice(5);

  const gapValidation = buildAdvancedAnalysis(withGap, config).validation;
  const suffixValidation = buildAdvancedAnalysis(suffix, config).validation;

  assert.equal(gapValidation.sourceContests, 25);
  assert.equal(gapValidation.availableRounds, 5);
  assert.deepEqual(gapValidation, suffixValidation);
});
