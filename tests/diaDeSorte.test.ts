import test from "node:test";
import assert from "node:assert/strict";
import type { Contest } from "../src/domain/types.js";
import {
  generateDiaDeSorteGames,
  rankLuckyMonths,
} from "../src/generator/diaDeSorte.js";

const months = [
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

function buildContests(): Contest[] {
  return Array.from({ length: 24 }, (_, index) => {
    const start = (index * 2) % 31;
    const numbers = Array.from({ length: 7 }, (_, offset) => ((start + offset * 3) % 31) + 1)
      .sort((a, b) => a - b);

    return {
      lottery: "dia-de-sorte" as const,
      number: 1200 + index,
      date: `2026-07-${String(index + 1).padStart(2, "0")}`,
      numbers,
      luckyMonth: months[index % months.length],
    };
  });
}

test("Dia de Sorte shares three fixed numbers and varies four numbers", () => {
  const games = generateDiaDeSorteGames(buildContests(), 4);

  assert.equal(games.length, 4);
  const fixed = games[0]!.fixedNumbers;
  assert.equal(fixed.length, 3);

  for (const game of games) {
    assert.equal(game.numbers.length, 7);
    assert.equal(new Set(game.numbers).size, 7);
    assert.deepEqual(game.fixedNumbers, fixed);
    assert.equal(game.variableNumbers.length, 4);
    assert.ok(fixed.every((number) => game.numbers.includes(number)));
    assert.ok(game.metadata.repeatedFromLastContest.length >= 1);
    assert.ok(game.metadata.repeatedFromLastContest.length <= 2);
    assert.ok(game.metadata.odd === 3 || game.metadata.odd === 4);
    assert.ok(game.luckyMonth);
  }
});

test("Dia de Sorte diversifies lucky months", () => {
  const games = generateDiaDeSorteGames(buildContests(), 4);
  assert.equal(new Set(games.map((game) => game.luckyMonth)).size, 4);
});

test("lucky-month ranking combines current year and history", () => {
  const contests = buildContests();
  contests.push(
    {
      lottery: "dia-de-sorte",
      number: 1300,
      date: "2026-08-01",
      numbers: [1, 5, 9, 13, 17, 21, 25],
      luckyMonth: "Maio",
    },
    {
      lottery: "dia-de-sorte",
      number: 1301,
      date: "2026-08-03",
      numbers: [2, 6, 10, 14, 18, 22, 26],
      luckyMonth: "Maio",
    },
  );

  assert.equal(rankLuckyMonths(contests)[0], "Maio");
});
