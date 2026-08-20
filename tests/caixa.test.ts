import test from "node:test";
import assert from "node:assert/strict";
import { CaixaContestSource, normalizeCaixaContest } from "../src/data/caixa.js";

const megaPayload = {
  numero: 3046,
  dataApuracao: "18/08/2026",
  listaDezenas: ["16", "23", "24", "33", "36", "52"],
  nomeTimeCoracaoMesSorte: "\0\0\0",
};

test("normalizeCaixaContest converts Caixa payload to domain contest", () => {
  const contest = normalizeCaixaContest("mega-sena", megaPayload);

  assert.deepEqual(contest, {
    lottery: "mega-sena",
    number: 3046,
    date: "2026-08-18",
    numbers: [16, 23, 24, 33, 36, 52],
  });
});

test("normalizeCaixaContest keeps lucky month only for Dia de Sorte", () => {
  const contest = normalizeCaixaContest("dia-de-sorte", {
    numero: 1276,
    dataApuracao: "19/08/2026",
    listaDezenas: ["06", "13", "15", "21", "22", "23", "28"],
    nomeTimeCoracaoMesSorte: "Junho\0\0",
  });

  assert.equal(contest.luckyMonth, "Junho");
});

test("CaixaContestSource requests the expected contest endpoint", async () => {
  let requestedUrl = "";
  const source = new CaixaContestSource(async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify(megaPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  const contest = await source.fetchContest("mega-sena", 3046);

  assert.equal(
    requestedUrl,
    "https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/3046",
  );
  assert.equal(contest.number, 3046);
});

test("normalizeCaixaContest rejects invalid draw sizes", () => {
  assert.throws(
    () =>
      normalizeCaixaContest("mega-sena", {
        ...megaPayload,
        listaDezenas: ["01", "02"],
      }),
    /Expected 6 numbers/,
  );
});
