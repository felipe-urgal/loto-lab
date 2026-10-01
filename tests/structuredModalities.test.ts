import test from "node:test";
import assert from "node:assert/strict";
import { evaluateGame } from "../src/checker/evaluate.js";
import { normalizeCaixaContest } from "../src/data/caixa.js";
import { assertValidGeneratedGame } from "../src/domain/validation.js";
import { generateUniformGames } from "../src/generator/generationPurpose.js";

test("+Milionaria keeps trevos separate from numeric selections", () => {
  const contest = normalizeCaixaContest("mais-milionaria", {
    numero: 300,
    dataApuracao: "30/09/2026",
    listaDezenas: ["05", "12", "20", "31", "42", "50"],
    trevosSorteados: ["2", "5"],
  });

  assert.deepEqual(contest.numbers, [5, 12, 20, 31, 42, 50]);
  assert.deepEqual(contest.secondary, { kind: "clovers", values: [2, 5] });

  const [game] = generateUniformGames({
    lottery: "mais-milionaria",
    gameCount: 1,
    fixedCount: 0,
    seed: "mais-milionaria-structured",
  });
  assert.equal(game?.numbers.length, 6);
  assert.equal(game?.secondary?.kind, "clovers");
  assert.equal(game?.secondary?.values.length, 2);
  assertValidGeneratedGame(game!);

  const checked = evaluateGame({
    ...game!,
    secondary: { kind: "clovers", values: [2, 4] },
  }, contest);
  assert.equal(checked.secondaryHits, 1);
});

test("Timemania keeps Time do Coracao separate from the ten-number bet", () => {
  const contest = normalizeCaixaContest("timemania", {
    numero: 2300,
    dataApuracao: "30/09/2026",
    listaDezenas: ["02", "08", "19", "31", "47", "55", "79"],
    nomeTimeCoracaoMesSorte: "SANTOS /SP",
  });

  assert.deepEqual(contest.secondary, {
    kind: "favorite-team",
    values: ["SANTOS /SP"],
  });

  const [game] = generateUniformGames({
    lottery: "timemania",
    gameCount: 1,
    fixedCount: 0,
    seed: "timemania-structured",
    referenceContest: contest,
  });
  assert.equal(game?.numbers.length, 10);
  assert.deepEqual(game?.secondary, contest.secondary);
  assertValidGeneratedGame(game!);

  const checked = evaluateGame(game!, contest);
  assert.equal(checked.secondaryHit, true);
});

test("Super Sete preserves column order and permits repeated digits across columns", () => {
  const contest = normalizeCaixaContest("super-sete", {
    numero: 800,
    dataApuracao: "30/09/2026",
    listaDezenas: ["1", "1", "7", "0", "5", "7", "9"],
  });

  assert.deepEqual(contest.columns, [1, 1, 7, 0, 5, 7, 9]);
  assert.deepEqual(contest.numbers, [1, 1, 7, 0, 5, 7, 9]);

  const [game] = generateUniformGames({
    lottery: "super-sete",
    gameCount: 1,
    fixedCount: 0,
    seed: "super-sete-structured",
  });
  assert.equal(game?.numbers.length, 0);
  assert.equal(game?.columns?.length, 7);
  assert.ok(game?.columns?.every((digit) => Number.isInteger(digit) && digit >= 0 && digit <= 9));
  assertValidGeneratedGame(game!);

  const checked = evaluateGame({
    ...game!,
    columns: [1, 2, 7, 0, 4, 7, 8],
  }, contest);
  assert.deepEqual(checked.matchedColumns, [1, 3, 4, 6]);
  assert.equal(checked.hits, 4);
});

test("Dia de Sorte emits typed lucky-month secondary while preserving compatibility", () => {
  const [game] = generateUniformGames({
    lottery: "dia-de-sorte",
    gameCount: 1,
    fixedCount: 0,
    seed: "dia-de-sorte-secondary",
  });

  assert.equal(game?.secondary?.kind, "lucky-month");
  assert.deepEqual(game?.secondary?.values, [game?.luckyMonth]);
  assertValidGeneratedGame(game!);
});
