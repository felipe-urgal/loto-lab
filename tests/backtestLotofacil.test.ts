import test from "node:test";
import assert from "node:assert/strict";
import type { Contest } from "../src/domain/types.js";
import { backtestLotofacil } from "../src/backtest/lotofacil.js";
import { compareLotofacilFixedCores } from "../src/backtest/compare.js";

function makeContest(number: number, overrideNumbers?: number[]): Contest {
  const numbers = overrideNumbers ?? Array.from({ length: 15 }, (_, index) => {
    return ((number + index * 2) % 25) + 1;
  }).sort((a, b) => a - b);

  return {
    lottery: "lotofacil",
    number,
    date: `2026-02-${String(((number - 1) % 28) + 1).padStart(2, "0")}`,
    numbers,
  };
}

const contests = Array.from({ length: 22 }, (_, index) => makeContest(index + 1));

test("backtestLotofacil uses configured fixed core and summarizes results", () => {
  const result = backtestLotofacil(contests, {
    gameCount: 2,
    fixedCount: 8,
    warmupContests: 20,
  });

  assert.equal(result.summary.testedContests, 2);
  assert.equal(result.summary.totalGames, 4);
  assert.equal(result.strategy.fixedCount, 8);
  assert.equal(result.rounds[0]!.generatedGames[0]!.fixedNumbers.length, 8);
  assert.equal(result.rounds[0]!.checks.length, 2);
});

test("backtestLotofacil does not use the target draw to generate games", () => {
  const changed = contests.map((contest) => ({ ...contest, numbers: [...contest.numbers] }));
  changed[20] = makeContest(21, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 25]);

  const options = {
    gameCount: 1,
    fixedCount: 8 as const,
    warmupContests: 20,
    startContest: 21,
    endContest: 21,
  };
  const original = backtestLotofacil(contests, options);
  const modified = backtestLotofacil(changed, options);

  assert.deepEqual(original.rounds[0]!.generatedGames, modified.rounds[0]!.generatedGames);
  assert.notDeepEqual(original.rounds[0]!.targetNumbers, modified.rounds[0]!.targetNumbers);
});

test("Lotofacil comparison evaluates 8, 9 and 10 fixed-number strategies", () => {
  const rows = compareLotofacilFixedCores(contests, {
    gameCount: 1,
    warmupContests: 20,
    startContest: 21,
    endContest: 21,
  });

  assert.equal(rows.length, 3);
  assert.deepEqual(
    new Set(rows.map((row) => row.name)),
    new Set(["lotofacil-8-fixas", "lotofacil-9-fixas", "lotofacil-10-fixas"]),
  );
  assert.ok(rows.every((row) => row.testedContests === 1));
});
