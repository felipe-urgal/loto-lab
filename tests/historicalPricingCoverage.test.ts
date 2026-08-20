import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, GeneratedGame } from "../src/domain/types.js";
import { evaluateGame } from "../src/checker/evaluate.js";
import { summarizeBacktestRounds } from "../src/backtest/shared.js";

const game: GeneratedGame = {
  lottery: "mega-sena",
  numbers: [1, 2, 3, 4, 5, 6],
  fixedNumbers: [1, 2, 3],
  variableNumbers: [4, 5, 6],
  metadata: {
    odd: 3,
    even: 3,
    sum: 21,
    repeatedFromLastContest: [],
  },
};

function megaContest(number: number, date: string): Contest {
  return {
    lottery: "mega-sena",
    number,
    date,
    numbers: [1, 2, 3, 20, 30, 40],
    prizeTiers: [
      { description: "6 acertos", winners: 0, prizeValue: 0 },
      { description: "5 acertos", winners: 2, prizeValue: 50000 },
      { description: "4 acertos", winners: 100, prizeValue: 900 },
    ],
  };
}

test("old contests without a known ticket price remain valid statistical checks", () => {
  const result = evaluateGame(game, megaContest(1000, "2008-01-01"));

  assert.equal(result.hits, 3);
  assert.equal(result.ticketCost, undefined);
  assert.equal(result.totalPrizeValue, 0);
  assert.equal(result.netResult, undefined);
});

test("financial coverage excludes unknown prices without dropping statistical rounds", () => {
  const oldCheck = evaluateGame(game, megaContest(1000, "2008-01-01"));
  const pricedCheck = evaluateGame(game, megaContest(2207, "2019-11-13"));

  const summary = summarizeBacktestRounds([
    { checks: [oldCheck] },
    { checks: [pricedCheck] },
  ]);

  assert.equal(summary.testedContests, 2);
  assert.equal(summary.totalGames, 2);
  assert.equal(summary.pricedGames, 1);
  assert.equal(summary.costCoverage, 0.5);
  assert.equal(summary.financialGames, 1);
  assert.equal(summary.financialCoverage, 0.5);
  assert.equal(summary.financialCost, 4.5);
  assert.equal(summary.totalCost, 4.5);
});
