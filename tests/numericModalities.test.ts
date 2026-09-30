import test from "node:test";
import assert from "node:assert/strict";
import { evaluateGame } from "../src/checker/evaluate.js";
import { normalizeCaixaContest } from "../src/data/caixa.js";
import { generateUniformGames } from "../src/generator/generationPurpose.js";

test("Quina normalizes official five-number draws and generates 5-15 number bets", () => {
  const contest = normalizeCaixaContest("quina", {
    numero: 7130,
    dataApuracao: "29/09/2026",
    listaDezenas: ["04", "16", "61", "69", "72"],
  });
  assert.deepEqual(contest.numbers, [4, 16, 61, 69, 72]);

  const games = generateUniformGames({
    lottery: "quina",
    gameCount: 2,
    fixedCount: 0,
    betSize: 15,
    seed: "quina-15",
  });
  assert.ok(games.every((game) => game.numbers.length === 15));
  assert.ok(games.every((game) => game.numbers.every((number) => number >= 1 && number <= 80)));
});

test("Lotomania keeps 00 in the numeric domain and creates an explicit mirror", () => {
  const contest = normalizeCaixaContest("lotomania", {
    numero: 1,
    dataApuracao: "02/10/1999",
    listaDezenas: [
      "00", "06", "11", "14", "16", "21", "22", "25", "32", "33",
      "34", "46", "61", "70", "73", "78", "88", "89", "90", "95",
    ],
  });
  assert.equal(contest.numbers[0], 0);

  const [game] = generateUniformGames({
    lottery: "lotomania",
    gameCount: 1,
    fixedCount: 0,
    seed: "lotomania-mirror",
  });
  assert.equal(game?.numbers.length, 50);
  assert.equal(game?.mirrorNumbers?.length, 50);
  assert.deepEqual(
    [...(game?.numbers ?? []), ...(game?.mirrorNumbers ?? [])].sort((a, b) => a - b),
    Array.from({ length: 100 }, (_, index) => index),
  );
});

test("Dupla Sena preserves and checks both draws independently", () => {
  const contest = normalizeCaixaContest("dupla-sena", {
    numero: 3014,
    dataApuracao: "28/09/2026",
    listaDezenas: ["11", "20", "24", "25", "33", "49"],
    listaDezenasSegundoSorteio: ["24", "26", "31", "35", "39", "43"],
    listaRateioPremio: [
      { descricaoFaixa: "6 acertos", faixa: 1, numeroDeGanhadores: 0, valorPremio: 0 },
      { descricaoFaixa: "5 acertos", faixa: 2, numeroDeGanhadores: 13, valorPremio: 6162.6 },
      { descricaoFaixa: "4 acertos", faixa: 3, numeroDeGanhadores: 767, valorPremio: 119.37 },
      { descricaoFaixa: "3 acertos", faixa: 4, numeroDeGanhadores: 15161, valorPremio: 3.01 },
      { descricaoFaixa: "6 acertos", faixa: 5, numeroDeGanhadores: 0, valorPremio: 0 },
      { descricaoFaixa: "5 acertos", faixa: 6, numeroDeGanhadores: 12, valorPremio: 6008.53 },
      { descricaoFaixa: "4 acertos", faixa: 7, numeroDeGanhadores: 693, valorPremio: 132.11 },
      { descricaoFaixa: "3 acertos", faixa: 8, numeroDeGanhadores: 13874, valorPremio: 3.29 },
    ],
  });

  assert.deepEqual(contest.secondDrawNumbers, [24, 26, 31, 35, 39, 43]);
  assert.equal(contest.prizeTiers?.filter((tier) => tier.draw === 1).length, 4);
  assert.equal(contest.prizeTiers?.filter((tier) => tier.draw === 2).length, 4);

  const check = evaluateGame({
    lottery: "dupla-sena",
    numbers: [11, 20, 24, 25, 33, 49],
    fixedNumbers: [],
    variableNumbers: [11, 20, 24, 25, 33, 49],
    metadata: {
      odd: 4,
      even: 2,
      sum: 162,
      repeatedFromLastContest: [],
    },
  }, contest);

  assert.equal(check.hits, 6);
  assert.equal(check.secondDrawHits, 1);
  assert.equal(check.prizeTier, "6-acertos");
  assert.equal(check.secondDrawPrizeTier, undefined);
});
