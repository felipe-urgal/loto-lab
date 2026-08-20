import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, GeneratedGame } from "../src/domain/types.js";
import { simpleBetPriceForContest } from "../src/finance/pricing.js";
import { resolvePrizeValue } from "../src/finance/prizes.js";
import { evaluateGame } from "../src/checker/evaluate.js";

function contest(overrides: Partial<Contest> & Pick<Contest, "lottery" | "number" | "date">): Contest {
  const drawSize = overrides.lottery === "lotofacil" ? 15 : overrides.lottery === "dia-de-sorte" ? 7 : 6;
  return {
    lottery: overrides.lottery,
    number: overrides.number,
    date: overrides.date,
    numbers: overrides.numbers ?? Array.from({ length: drawSize }, (_, index) => index + 1),
    ...overrides,
  };
}

test("simpleBetPriceForContest follows known Caixa repricing periods", () => {
  assert.equal(simpleBetPriceForContest(contest({ lottery: "mega-sena", number: 2207, date: "2019-11-13" })), 4.5);
  assert.equal(simpleBetPriceForContest(contest({ lottery: "mega-sena", number: 2588, date: "2023-05-03" })), 5);
  assert.equal(simpleBetPriceForContest(contest({ lottery: "mega-sena", number: 2886, date: "2025-07-10" })), 6);

  assert.equal(simpleBetPriceForContest(contest({ lottery: "lotofacil", number: 1889, date: "2019-11-11" })), 2.5);
  assert.equal(simpleBetPriceForContest(contest({ lottery: "lotofacil", number: 2801, date: "2023-04-30" })), 3);
  assert.equal(simpleBetPriceForContest(contest({ lottery: "lotofacil", number: 3438, date: "2025-07-09" })), 3.5);

  assert.equal(simpleBetPriceForContest(contest({ lottery: "dia-de-sorte", number: 752, date: "2023-05-02" })), 2);
  assert.equal(simpleBetPriceForContest(contest({ lottery: "dia-de-sorte", number: 753, date: "2023-05-03" })), 2.5);
});

test("resolvePrizeValue uses the real rateio stored in the contest", () => {
  const target = contest({
    lottery: "lotofacil",
    number: 3766,
    date: "2026-08-19",
    prizeTiers: [
      { description: "15 acertos", winners: 3, prizeValue: 1864166.67 },
      { description: "14 acertos", winners: 286, prizeValue: 1985.2 },
      { description: "13 acertos", winners: 9276, prizeValue: 35 },
      { description: "12 acertos", winners: 123456, prizeValue: 14 },
      { description: "11 acertos", winners: 654321, prizeValue: 7 },
    ],
  });

  assert.deepEqual(resolvePrizeValue(target, 12), {
    numberPrizeValue: 14,
    totalPrizeValue: 14,
  });
  assert.deepEqual(resolvePrizeValue(target, 10), { totalPrizeValue: 0 });
});

test("Dia de Sorte combines number prize and Mes da Sorte prize", () => {
  const target = contest({
    lottery: "dia-de-sorte",
    number: 1276,
    date: "2026-08-19",
    numbers: [6, 13, 15, 21, 22, 23, 28],
    luckyMonth: "Junho",
    prizeTiers: [
      { description: "7 acertos", winners: 0, prizeValue: 0 },
      { description: "6 acertos", winners: 10, prizeValue: 4250.55 },
      { description: "5 acertos", winners: 500, prizeValue: 25 },
      { description: "4 acertos", winners: 5000, prizeValue: 5 },
      { description: "Mês da Sorte", winners: 100000, prizeValue: 2.5 },
    ],
  });
  const game: GeneratedGame = {
    lottery: "dia-de-sorte",
    numbers: [6, 13, 21, 23, 24, 29, 30],
    fixedNumbers: [6, 20, 23],
    variableNumbers: [13, 21, 24, 29],
    luckyMonth: "Junho",
    metadata: {
      odd: 4,
      even: 3,
      sum: 146,
      repeatedFromLastContest: [],
    },
  };

  const result = evaluateGame(game, target);

  assert.equal(result.hits, 4);
  assert.equal(result.ticketCost, 2.5);
  assert.equal(result.numberPrizeValue, 5);
  assert.equal(result.luckyMonthPrizeValue, 2.5);
  assert.equal(result.totalPrizeValue, 7.5);
  assert.equal(result.netResult, 5);
});
