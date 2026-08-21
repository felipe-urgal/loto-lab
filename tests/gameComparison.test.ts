import assert from "node:assert/strict";
import test from "node:test";
import { buildBatchComparison } from "../src/api/gameComparison.js";
import type { GeneratedGameBatchRecord } from "../src/persistence/types.js";

function batch(lottery: GeneratedGameBatchRecord["lottery"], games: GeneratedGameBatchRecord["games"]): GeneratedGameBatchRecord {
  return {
    id: 77,
    lottery,
    targetContestNumber: 100,
    generatorOptions: {},
    createdAt: "2026-08-21T12:00:00.000Z",
    hasRealBet: false,
    games,
  };
}

test("batch comparison highlights matches and summarizes the best game per contest without financial fields", () => {
  const input = batch("mega-sena", [
    {
      lottery: "mega-sena",
      numbers: [1, 2, 3, 4, 5, 6],
      fixedNumbers: [1, 2, 3],
      variableNumbers: [4, 5, 6],
      metadata: { odd: 3, even: 3, sum: 21, repeatedFromLastContest: [] },
    },
    {
      lottery: "mega-sena",
      numbers: [1, 10, 20, 30, 40, 50],
      fixedNumbers: [1, 10, 20],
      variableNumbers: [30, 40, 50],
      metadata: { odd: 1, even: 5, sum: 151, repeatedFromLastContest: [] },
    },
  ]);

  const result = buildBatchComparison(input, [
    { number: 100, date: "2026-08-20", numbers: [1, 2, 8, 9, 10, 11] },
    { number: 101, date: "2026-08-21", numbers: [1, 2, 3, 4, 40, 60] },
  ]);

  assert.equal(result.summary.contestCount, 2);
  assert.equal(result.summary.bestHits, 4);
  assert.equal(result.summary.bestContestNumber, 101);
  assert.equal(result.summary.averageBestHits, 3);
  assert.deepEqual(result.items[0]!.matchedAnyNumbers, [1, 2, 10]);
  assert.deepEqual(result.items[1]!.games[0]!.matchedNumbers, [1, 2, 3, 4]);
  assert.deepEqual(result.items[1]!.games[0]!.fixedMatchedNumbers, [1, 2, 3]);

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("ticketCost"), false);
  assert.equal(serialized.includes("totalPrizeValue"), false);
  assert.equal(serialized.includes("netResult"), false);
});

test("empty comparison remains a valid result while contest history is unavailable", () => {
  const input = batch("lotofacil", [{
    lottery: "lotofacil",
    numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    fixedNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
    variableNumbers: [9, 10, 11, 12, 13, 14, 15],
    metadata: { odd: 8, even: 7, sum: 120, repeatedFromLastContest: [] },
  }]);

  const result = buildBatchComparison(input, []);

  assert.deepEqual(result.items, []);
  assert.equal(result.summary.contestCount, 0);
  assert.equal(result.summary.bestHits, 0);
  assert.equal(result.summary.averageBestHits, 0);
  assert.equal(result.summary.bestContestNumber, undefined);
  assert.equal(result.drawSize, 15);
});

test("Lotofacil comparison preserves the 15-number game denominator and exact matches", () => {
  const input = batch("lotofacil", [{
    lottery: "lotofacil",
    numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    fixedNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
    variableNumbers: [9, 10, 11, 12, 13, 14, 15],
    metadata: { odd: 8, even: 7, sum: 120, repeatedFromLastContest: [] },
  }]);

  const result = buildBatchComparison(input, [{
    number: 100,
    date: "2026-08-21",
    numbers: [1, 2, 3, 4, 5, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
  }]);

  assert.equal(result.drawSize, 15);
  assert.equal(result.items[0]!.games[0]!.hits, 5);
  assert.deepEqual(result.items[0]!.games[0]!.matchedNumbers, [1, 2, 3, 4, 5]);
  assert.equal(result.summary.bestHits, 5);
});

test("Dia de Sorte comparison keeps lucky-month hits separate from number hits", () => {
  const input = batch("dia-de-sorte", [{
    lottery: "dia-de-sorte",
    numbers: [1, 2, 3, 4, 5, 6, 7],
    fixedNumbers: [1, 2, 3],
    variableNumbers: [4, 5, 6, 7],
    luckyMonth: "Agosto",
    metadata: { odd: 4, even: 3, sum: 28, repeatedFromLastContest: [] },
  }]);

  const result = buildBatchComparison(input, [{
    number: 100,
    date: "2026-08-21",
    numbers: [1, 8, 9, 10, 11, 12, 13],
    luckyMonth: "Agosto",
  }]);

  assert.equal(result.items[0]!.games[0]!.hits, 1);
  assert.equal(result.items[0]!.games[0]!.luckyMonthHit, true);
  assert.equal(result.summary.bestHits, 1);
});
