import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRandomnessIntegrityAudit,
  RANDOMNESS_AUDIT_MIN_CONTESTS,
} from "../src/analysis/randomnessIntegrity.js";
import { createSeededRandom } from "../src/generator/shared.js";
import { getLotteryConfig } from "../src/lotteries/config.js";
import type { Contest } from "../src/domain/types.js";

function randomContests(count: number, seed = "audit-test"): Contest[] {
  const config = getLotteryConfig("mega-sena");
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, (_, index) => {
    const pool = Array.from({ length: config.maxNumber }, (_, i) => i + 1);
    const numbers: number[] = [];
    while (numbers.length < config.drawSize) {
      numbers.push(pool.splice(Math.floor(random() * pool.length), 1)[0]!);
    }
    return {
      lottery: "mega-sena",
      number: index + 1,
      date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
      numbers: numbers.sort((a, b) => a - b),
    };
  });
}

test("randomness audit is deterministic for the same history and seed", () => {
  const config = getLotteryConfig("mega-sena");
  const contests = randomContests(120);
  const first = buildRandomnessIntegrityAudit(contests, config, { samples: 200, seed: "fixed" });
  const second = buildRandomnessIntegrityAudit(contests, config, { samples: 200, seed: "fixed" });

  assert.deepEqual(first, second);
  assert.equal(first.available, true);
  assert.equal(first.methodology.predictive, false);
  assert.equal(first.methodology.baseline, "uniform-without-replacement");
  assert.equal(first.scope.analyzedContests, 120);
  assert.equal(first.metrics.length, 6);
  assert.equal(first.perNumber.length, 60);
});

test("randomness audit flags a deliberately concentrated synthetic history", () => {
  const config = getLotteryConfig("mega-sena");
  const contests = Array.from({ length: 120 }, (_, index) => ({
    lottery: "mega-sena" as const,
    number: index + 1,
    date: "2026-01-01",
    numbers: [1, 2, 3, 4, 5, 6],
  }));

  const result = buildRandomnessIntegrityAudit(contests, config, { samples: 200, seed: "biased" });

  assert.equal(result.available, true);
  assert.equal(result.status, "investigate");
  assert.ok(result.metrics.some((metric) => metric.status === "investigate"));
  assert.ok(result.perNumber.some((item) => item.status === "investigate"));
});

test("insufficient history stays explicitly unavailable instead of returning zero evidence", () => {
  const config = getLotteryConfig("mega-sena");
  const contests = randomContests(RANDOMNESS_AUDIT_MIN_CONTESTS - 1);
  const result = buildRandomnessIntegrityAudit(contests, config, { samples: 200 });

  assert.equal(result.available, false);
  assert.equal(result.status, "insufficient-evidence");
  assert.deepEqual(result.metrics, []);
  assert.deepEqual(result.perNumber, []);
});

test("audit does not cross a gap and reports excluded history", () => {
  const config = getLotteryConfig("mega-sena");
  const first = randomContests(60, "first");
  const second = randomContests(70, "second").map((contest, index) => ({
    ...contest,
    number: 100 + index,
  }));
  const result = buildRandomnessIntegrityAudit([...first, ...second], config, {
    samples: 200,
    seed: "gap",
  });

  assert.equal(result.scope.gapDetected, true);
  assert.equal(result.scope.continuous, false);
  assert.equal(result.scope.analyzedContests, 70);
  assert.equal(result.scope.excludedBeforeSegment, 60);
  assert.equal(result.scope.firstContest, 100);
});

test("audit separates the latest current-format segment after a draw-size change", () => {
  const config = getLotteryConfig("mega-sena");
  const legacy = randomContests(60, "legacy").map((contest) => ({
    ...contest,
    numbers: contest.numbers.slice(0, 5),
  }));
  const current = randomContests(70, "current").map((contest, index) => ({
    ...contest,
    number: 61 + index,
  }));
  const result = buildRandomnessIntegrityAudit([...legacy, ...current], config, {
    samples: 200,
    seed: "regime",
  });

  assert.equal(result.scope.regimeChangeDetected, true);
  assert.equal(result.scope.analyzedContests, 70);
  assert.equal(result.scope.excludedBeforeSegment, 60);
  assert.equal(result.scope.firstContest, 61);
});

test("all p-values remain bounded and Bonferroni adjustment never decreases them", () => {
  const config = getLotteryConfig("mega-sena");
  const result = buildRandomnessIntegrityAudit(randomContests(100, "bounds"), config, {
    samples: 200,
    seed: "bounds-null",
  });

  for (const metric of result.metrics) {
    assert.ok(metric.pValue >= 0 && metric.pValue <= 1);
    assert.ok(metric.adjustedPValue >= metric.pValue && metric.adjustedPValue <= 1);
  }
  for (const item of result.perNumber) {
    assert.ok(item.pValue >= 0 && item.pValue <= 1);
    assert.ok(item.adjustedPValue >= item.pValue && item.adjustedPValue <= 1);
  }
});
