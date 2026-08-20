import test from "node:test";
import assert from "node:assert/strict";
import { generateMegaSenaGames } from "../src/generator/megaSena.js";
import type { Contest } from "../src/domain/types.js";

const contests: Contest[] = [
  { lottery: "mega-sena", number: 100, date: "2026-07-01", numbers: [1, 6, 12, 20, 33, 42] },
  { lottery: "mega-sena", number: 101, date: "2026-07-03", numbers: [2, 6, 14, 21, 35, 42] },
  { lottery: "mega-sena", number: 102, date: "2026-07-05", numbers: [3, 9, 17, 23, 42, 58] },
  { lottery: "mega-sena", number: 103, date: "2026-07-08", numbers: [4, 10, 17, 27, 43, 58] },
  { lottery: "mega-sena", number: 104, date: "2026-07-10", numbers: [5, 11, 20, 30, 42, 60] },
  { lottery: "mega-sena", number: 105, date: "2026-07-12", numbers: [6, 14, 21, 32, 43, 58] },
  { lottery: "mega-sena", number: 106, date: "2026-07-15", numbers: [7, 17, 23, 30, 35, 42] },
  { lottery: "mega-sena", number: 107, date: "2026-07-17", numbers: [8, 20, 27, 32, 43, 58] },
  { lottery: "mega-sena", number: 108, date: "2026-07-20", numbers: [9, 14, 23, 30, 42, 60] },
  { lottery: "mega-sena", number: 109, date: "2026-07-22", numbers: [10, 17, 27, 35, 43, 58] },
];

test("generateMegaSenaGames shares exactly three fixed numbers", () => {
  const games = generateMegaSenaGames(contests, 2);

  assert.equal(games.length, 2);
  assert.equal(games[0]!.numbers.length, 6);
  assert.equal(games[1]!.numbers.length, 6);
  assert.equal(new Set(games[0]!.numbers).size, 6);
  assert.equal(new Set(games[1]!.numbers).size, 6);
  assert.equal(games[0]!.fixedNumbers.length, 3);
  assert.deepEqual(games[0]!.fixedNumbers, games[1]!.fixedNumbers);

  const shared = games[0]!.numbers.filter((number) => games[1]!.numbers.includes(number));
  assert.deepEqual(shared.sort((a, b) => a - b), games[0]!.fixedNumbers);
});

test("generateMegaSenaGames keeps variables diversified", () => {
  const games = generateMegaSenaGames(contests, 2);
  const firstVariables = new Set(games[0]!.variableNumbers);
  const reusedVariables = games[1]!.variableNumbers.filter((number) => firstVariables.has(number));

  assert.equal(reusedVariables.length, 0);
});
