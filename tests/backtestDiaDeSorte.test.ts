import test from "node:test";
import assert from "node:assert/strict";
import type { Contest } from "../src/domain/types.js";
import { backtestDiaDeSorte } from "../src/backtest/diaDeSorte.js";

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function makeContest(number: number, overrideNumbers?: number[]): Contest {
  const numbers = overrideNumbers ?? Array.from({ length: 7 }, (_, index) => {
    return ((number + index * 3) % 31) + 1;
  }).sort((a, b) => a - b);

  return {
    lottery: "dia-de-sorte",
    number,
    date: `2026-03-${String(((number - 1) % 28) + 1).padStart(2, "0")}`,
    numbers,
    luckyMonth: MONTHS[(number - 1) % MONTHS.length],
  };
}

const contests = Array.from({ length: 22 }, (_, index) => makeContest(index + 1));

test("backtestDiaDeSorte summarizes number hits and lucky-month hits", () => {
  const result = backtestDiaDeSorte(contests, {
    gameCount: 2,
    warmupContests: 20,
  });

  assert.equal(result.summary.testedContests, 2);
  assert.equal(result.summary.totalGames, 4);
  assert.equal(result.rounds[0]!.generatedGames[0]!.fixedNumbers.length, 3);
  assert.equal(result.rounds[0]!.checks.length, 2);
  assert.ok(result.summary.luckyMonthHits >= 0);
  assert.ok(result.summary.luckyMonthRate >= 0 && result.summary.luckyMonthRate <= 1);
});

test("backtestDiaDeSorte does not use the target draw to generate games", () => {
  const changed = contests.map((contest) => ({ ...contest, numbers: [...contest.numbers] }));
  changed[20] = makeContest(21, [1, 5, 9, 13, 17, 21, 31]);

  const options = {
    gameCount: 1,
    warmupContests: 20,
    startContest: 21,
    endContest: 21,
  };
  const original = backtestDiaDeSorte(contests, options);
  const modified = backtestDiaDeSorte(changed, options);

  assert.deepEqual(original.rounds[0]!.generatedGames, modified.rounds[0]!.generatedGames);
  assert.notDeepEqual(original.rounds[0]!.targetNumbers, modified.rounds[0]!.targetNumbers);
});
