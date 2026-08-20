import test from "node:test";
import assert from "node:assert/strict";
import type { Contest } from "../src/domain/types.js";
import { generateLotofacilGames } from "../src/generator/lotofacil.js";

function buildContests(): Contest[] {
  return Array.from({ length: 24 }, (_, index) => {
    const start = (index * 3) % 25;
    const numbers = Array.from({ length: 15 }, (_, offset) => ((start + offset) % 25) + 1)
      .sort((a, b) => a - b);

    return {
      lottery: "lotofacil" as const,
      number: 3500 + index,
      date: `2026-07-${String(index + 1).padStart(2, "0")}`,
      numbers,
    };
  });
}

test("Lotofacil shares the configured fixed core", () => {
  const games = generateLotofacilGames(buildContests(), { gameCount: 4, fixedCount: 8 });

  assert.equal(games.length, 4);
  const expectedFixed = games[0]!.fixedNumbers;
  assert.equal(expectedFixed.length, 8);

  for (const game of games) {
    assert.equal(game.numbers.length, 15);
    assert.equal(new Set(game.numbers).size, 15);
    assert.deepEqual(game.fixedNumbers, expectedFixed);
    assert.equal(game.variableNumbers.length, 7);
    assert.ok(expectedFixed.every((number) => game.numbers.includes(number)));
    assert.equal(game.metadata.lineDistribution?.reduce((a, b) => a + b, 0), 15);
    assert.equal(game.metadata.columnDistribution?.reduce((a, b) => a + b, 0), 15);
    assert.ok(game.metadata.repeatedFromLastContest.length >= 7);
    assert.ok(game.metadata.repeatedFromLastContest.length <= 11);
  }
});

test("Lotofacil supports 8, 9 and 10 fixed numbers", () => {
  const contests = buildContests();

  for (const fixedCount of [8, 9, 10] as const) {
    const games = generateLotofacilGames(contests, { gameCount: 2, fixedCount });
    assert.equal(games[0]!.fixedNumbers.length, fixedCount);
    assert.equal(games[0]!.variableNumbers.length, 15 - fixedCount);
    assert.deepEqual(games[0]!.fixedNumbers, games[1]!.fixedNumbers);
  }
});

test("Lotofacil rejects invalid fixed counts", () => {
  assert.throws(
    () => generateLotofacilGames(buildContests(), { fixedCount: 7 as 8 }),
    /fixedCount must be 8, 9 or 10/,
  );
});
