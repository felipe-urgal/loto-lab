import test from "node:test";
import assert from "node:assert/strict";
import { CaixaContestSource, normalizeCaixaAgenda, normalizeCaixaContest } from "../src/data/caixa.js";

const megaPayload = {
  numero: 3046,
  dataApuracao: "18/08/2026",
  dataProximoConcurso: "20/08/2026",
  numeroConcursoProximo: 3047,
  valorEstimadoProximoConcurso: 50000000,
  acumulado: true,
  listaDezenas: ["16", "23", "24", "33", "36", "52"],
  nomeTimeCoracaoMesSorte: "\0\0\0",
  listaRateioPremio: [
    { descricaoFaixa: "6 acertos", numeroDeGanhadores: 0, valorPremio: 0 },
    { descricaoFaixa: "5 acertos", numeroDeGanhadores: 38, valorPremio: 55819.16 },
    { descricaoFaixa: "4 acertos", numeroDeGanhadores: 3290, valorPremio: 921.02 },
  ],
  valorArrecadado: 44677284,
};

test("normalizeCaixaContest converts Caixa payload to domain contest", () => {
  const contest = normalizeCaixaContest("mega-sena", megaPayload);

  assert.deepEqual(contest, {
    lottery: "mega-sena",
    number: 3046,
    date: "2026-08-18",
    numbers: [16, 23, 24, 33, 36, 52],
    prizeTiers: [
      { description: "6 acertos", winners: 0, prizeValue: 0 },
      { description: "5 acertos", winners: 38, prizeValue: 55819.16 },
      { description: "4 acertos", winners: 3290, prizeValue: 921.02 },
    ],
    amountCollected: 44677284,
  });
});

test("normalizeCaixaAgenda converts official next-contest metadata", () => {
  assert.deepEqual(normalizeCaixaAgenda("mega-sena", megaPayload), {
    lottery: "mega-sena",
    currentContest: 3046,
    nextContest: 3047,
    nextDrawDate: "2026-08-20",
    estimatedPrize: 50000000,
    accumulated: true,
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
  assert.equal(contest.prizeTiers?.[1]?.prizeValue, 55819.16);
});

test("CaixaContestSource fetches latest agenda metadata", async () => {
  let requestedUrl = "";
  const source = new CaixaContestSource(async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify(megaPayload), { status: 200 });
  });
  const agenda = await source.fetchAgenda("mega-sena");
  assert.equal(requestedUrl, "https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena");
  assert.equal(agenda.nextContest, 3047);
  assert.equal(agenda.nextDrawDate, "2026-08-20");
});

test("normalizeCaixaContest rejects invalid draw sizes", () => {
  assert.throws(
    () => normalizeCaixaContest("mega-sena", { ...megaPayload, listaDezenas: ["01", "02"] }),
    /Expected 6 numbers/,
  );
});
