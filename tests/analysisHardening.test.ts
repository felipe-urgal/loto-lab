import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, LotteryId } from "../src/domain/types.js";
import { buildAdvancedAnalysis } from "../src/analysis/advanced.js";
import {
  hardenAdvancedAnalysis,
  MIN_ASSOCIATION_HISTORY,
  MIN_EVIDENCE_ROUNDS,
} from "../src/analysis/advancedHardening.js";
import { getLotteryConfig } from "../src/lotteries/config.js";

function syntheticContests(lottery: LotteryId, count: number, start = 1): Contest[] {
  const config = getLotteryConfig(lottery);
  const population = config.maxNumber - config.minNumber + 1;
  return Array.from({ length: count }, (_, index) => {
    const step = lottery === "mega-sena" ? 7 : lottery === "lotofacil" ? 1 : 5;
    const numbers = Array.from({ length: config.drawSize }, (_, offset) =>
      ((index * 3 + offset * step) % population) + config.minNumber,
    ).sort((a, b) => a - b);
    return {
      lottery,
      number: start + index,
      date: `2026-${String((Math.floor(index / 28) % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
      numbers,
    };
  });
}

function hardened(lottery: LotteryId, contests: Contest[]) {
  const config = getLotteryConfig(lottery);
  return hardenAdvancedAnalysis(buildAdvancedAnalysis(contests, config), contests, config) as any;
}

test("methodology validator compares historical observations with transition-matched baselines", () => {
  const contests = syntheticContests("lotofacil", 80);
  const result = hardened("lotofacil", contests);
  const filter = result.structure.methodologyFilter;

  assert.equal(filter.historical.total, 79);
  assert.equal(filter.historicalExpected.total, 79);
  assert.ok(filter.historicalExpected.coverage > 0 && filter.historicalExpected.coverage < 1);
  assert.ok(filter.historicalExpected.minCoverage <= filter.historicalExpected.coverage);
  assert.ok(filter.historicalExpected.maxCoverage >= filter.historicalExpected.coverage);
  assert.deepEqual(filter.nextContestUniverse, filter.exactUniverse);
  assert.match(filter.note, /N-1 → N/);
});

test("structure historical summaries exclude the current reference contest", () => {
  const contests = syntheticContests("mega-sena", 12);
  const result = hardened("mega-sena", contests);
  const previous = contests.slice(0, -1);
  const expectedOddMean = previous.reduce(
    (sum, contest) => sum + contest.numbers.filter((number) => number % 2 !== 0).length,
    0,
  ) / previous.length;

  assert.ok(Math.abs(result.structure.metrics.odd.observed.mean - expectedOddMean) < 1e-4);
});

test("rank movement uses exact contest numbers and becomes unavailable across a missing reference", () => {
  const contests = syntheticContests("mega-sena", 80).filter((contest) => contest.number !== 70);
  const result = hardened("mega-sena", contests);
  const item = result.ranking.dynamics.items[0];

  assert.equal(result.latestContest.number, 80);
  assert.equal(item.previousRanks.ten, null);
  assert.equal(item.movements.ten, null);
  assert.equal(item.trend, "unknown");
  assert.equal(result.validation.sourceContests, 10);
  assert.equal(result.validation.availableRounds, 0);
});

test("left-censored history is explicit and does not fabricate boundary-dependent values", () => {
  const contests = syntheticContests("mega-sena", 3, 1000);
  const result = hardened("mega-sena", contests);

  assert.equal(result.dataQuality.firstStoredContest, 1000);
  assert.equal(result.dataQuality.leftCensored, true);
  assert.equal(result.dynamics.cycles.available, false);
  const neverSeen = result.ranking.dynamics.items.find((item: any) =>
    contests.every((contest) => !contest.numbers.includes(item.number))
  );
  assert.ok(neverSeen);
  assert.equal(neverSeen.delay.current, null);
});

test("validation suppresses evidence labels below the minimum target sample", () => {
  const result = hardened("mega-sena", syntheticContests("mega-sena", 21));
  const period = result.validation.periods[0];

  assert.equal(result.validation.methodology.minimumEvidenceRounds, MIN_EVIDENCE_ROUNDS);
  assert.equal(period.rounds, 1);
  assert.equal(period.evidenceEligible, false);
  assert.ok(period.tiers.every((tier: any) => tier.evidence === "none"));
});

test("association exploration stays unavailable below its minimum history", () => {
  const result = hardened("dia-de-sorte", syntheticContests("dia-de-sorte", MIN_ASSOCIATION_HISTORY - 1));

  assert.equal(result.combinations.methodology.minimumContests, MIN_ASSOCIATION_HISTORY);
  assert.equal(result.combinations.pairs.length, 0);
  assert.equal(result.combinations.highlights.positivePairs.length, 0);
  assert.equal(result.combinations.highlights.positiveTriples.length, 0);
  assert.match(result.combinations.methodology.note, /separadamente à família de pares/);
});
