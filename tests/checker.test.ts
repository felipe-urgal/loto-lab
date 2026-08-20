import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, GeneratedGame } from "../src/domain/types.js";
import { evaluateGame, prizeTierFor } from "../src/checker/evaluate.js";

function game(overrides: Partial<GeneratedGame> = {}): GeneratedGame {
  return {
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
    ...overrides,
  };
}

test("checker splits fixed and variable hits and identifies Mega-Sena tier", () => {
  const target: Contest = {
    lottery: "mega-sena",
    number: 100,
    date: "2026-08-20",
    numbers: [1, 2, 4, 5, 20, 30],
  };

  const result = evaluateGame(game(), target);
  assert.equal(result.hits, 4);
  assert.deepEqual(result.matchedNumbers, [1, 2, 4, 5]);
  assert.equal(result.fixedHits, 2);
  assert.equal(result.variableHits, 2);
  assert.equal(result.prizeTier, "quadra");
});

test("checker identifies Lotofacil prize tiers", () => {
  assert.equal(prizeTierFor("lotofacil", 10), undefined);
  assert.equal(prizeTierFor("lotofacil", 11), "11-acertos");
  assert.equal(prizeTierFor("lotofacil", 15), "15-acertos");
});

test("checker evaluates Dia de Sorte lucky month separately", () => {
  const diaGame = game({
    lottery: "dia-de-sorte",
    numbers: [1, 2, 3, 4, 5, 6, 7],
    fixedNumbers: [1, 2, 3],
    variableNumbers: [4, 5, 6, 7],
    luckyMonth: "Junho",
  });
  const target: Contest = {
    lottery: "dia-de-sorte",
    number: 10,
    date: "2026-08-20",
    numbers: [1, 2, 4, 7, 10, 20, 30],
    luckyMonth: "junho",
  };

  const result = evaluateGame(diaGame, target);
  assert.equal(result.hits, 4);
  assert.equal(result.prizeTier, "4-acertos");
  assert.equal(result.luckyMonthHit, true);
});

test("checker rejects a game from another lottery", () => {
  const target: Contest = {
    lottery: "lotofacil",
    number: 1,
    date: "2026-08-20",
    numbers: Array.from({ length: 15 }, (_, index) => index + 1),
  };

  assert.throws(() => evaluateGame(game(), target), /does not match/);
});
