import test from "node:test";
import assert from "node:assert/strict";
import type { Contest } from "../src/domain/types.js";
import { backtestMegaSena } from "../src/backtest/megaSena.js";

function makeContest(number: number, overrideNumbers?: number[]): Contest {
  const numbers = overrideNumbers ?? Array.from({ length: 6 }, (_, index) => {
    return ((number * 7 + index * 11) % 60) + 1;
  }).sort((a, b) => a - b);

  return {
    lottery: "mega-sena",
    number,
    date: `2026-01-${String(((number - 1) % 28) + 1).padStart(2, "0")}`,
    numbers,
  };
}

const contests = Array.from({ length: 30 }, (_, index) => makeContest(index + 1));

test("backtestMegaSena produces one round per target after warmup", () => {
  const result = backtestMegaSena(contests, { gameCount: 2, warmupContests: 20 });

  assert.equal(result.summary.testedContests, 10);
  assert.equal(result.summary.totalGames, 20);
  assert.equal(result.rounds[0]!.contest, 21);
  assert.equal(result.rounds.at(-1)!.contest, 30);
});

test("backtestMegaSena does not use the target contest to generate its games", () => {
  const changedTarget = contests.map((contest) => ({ ...contest, numbers: [...contest.numbers] }));
  changedTarget[20] = makeContest(21, [2, 12, 22, 32, 42, 52]);

  const original = backtestMegaSena(contests, {
    gameCount: 2,
    warmupContests: 20,
    startContest: 21,
    endContest: 21,
  });
  const modified = backtestMegaSena(changedTarget, {
    gameCount: 2,
    warmupContests: 20,
    startContest: 21,
    endContest: 21,
  });

  assert.deepEqual(
    original.rounds[0]!.generatedGames,
    modified.rounds[0]!.generatedGames,
  );
  assert.notDeepEqual(
    original.rounds[0]!.targetNumbers,
    modified.rounds[0]!.targetNumbers,
  );
});
