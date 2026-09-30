import test from "node:test";
import assert from "node:assert/strict";
import {
  CaixaProductSource,
  normalizeCaixaProductAgenda,
  normalizeCaixaProductResult,
  type CaixaProductResponse,
} from "../src/data/caixaProduct.js";

const quina: CaixaProductResponse = {
  numero: 7130,
  dataApuracao: "29/09/2026",
  dataProximoConcurso: "30/09/2026",
  numeroConcursoProximo: 7131,
  valorEstimadoProximoConcurso: 13500000,
  acumulado: true,
  listaDezenas: ["04", "16", "61", "69", "72"],
};

const lotomania: CaixaProductResponse = {
  numero: 1,
  dataApuracao: "02/10/1999",
  listaDezenas: [
    "00", "06", "11", "14", "16", "21", "22", "25", "32", "33",
    "34", "46", "61", "70", "73", "78", "88", "89", "90", "95",
  ],
};

const duplaSena: CaixaProductResponse = {
  numero: 3014,
  dataApuracao: "28/09/2026",
  listaDezenas: ["11", "20", "24", "25", "33", "49"],
  listaDezenasSegundoSorteio: ["24", "26", "31", "35", "39", "43"],
};

const timemania: CaixaProductResponse = {
  numero: 1,
  dataApuracao: "01/03/2008",
  listaDezenas: ["24", "31", "51", "57", "63", "71", "80"],
  nomeTimeCoracaoMesSorte: "PALMAS/TO",
};

const superSete: CaixaProductResponse = {
  numero: 1,
  dataApuracao: "02/10/2020",
  listaDezenas: ["2", "9", "9", "8", "7", "7", "6"],
};

const maisMilionaria: CaixaProductResponse = {
  numero: 393,
  dataApuracao: "27/09/2026",
  listaDezenas: ["02", "15", "17", "26", "29", "32"],
  trevosSorteados: ["4", "5"],
};

const federal: CaixaProductResponse = {
  numero: 6104,
  dataApuracao: "27/09/2026",
  listaDezenas: ["059074", "003557", "020563", "040449", "007802"],
};

const loteca: CaixaProductResponse = {
  numero: 1272,
  dataApuracao: "28/09/2026",
  listaResultadoEquipeEsportiva: Array.from({ length: 14 }, (_, index) => ({
    nuSequencial: index + 1,
    nomeEquipeUm: `Casa ${index + 1}`,
    nomeEquipeDois: `Fora ${index + 1}`,
    nuGolEquipeUm: index % 3 === 0 ? 2 : index % 3 === 1 ? 1 : 0,
    nuGolEquipeDois: index % 3 === 0 ? 0 : index % 3 === 1 ? 1 : 2,
  })),
};

test("normalizes verified numeric-family Caixa payloads", () => {
  assert.deepEqual(normalizeCaixaProductResult("quina", quina).result, {
    family: "number-draw",
    numbers: [4, 16, 61, 69, 72],
  });
  assert.equal(
    (normalizeCaixaProductResult("lotomania", lotomania).result as { numbers: number[] }).numbers.length,
    20,
  );
  assert.deepEqual(normalizeCaixaProductResult("dupla-sena", duplaSena).result, {
    family: "dual-number-draw",
    draws: [[11, 20, 24, 25, 33, 49], [24, 26, 31, 35, 39, 43]],
  });
  assert.deepEqual(normalizeCaixaProductResult("timemania", timemania).result, {
    family: "number-draw-secondary",
    numbers: [24, 31, 51, 57, 63, 71, 80],
    secondary: { kind: "favorite-team", values: ["PALMAS/TO"] },
  });
  assert.deepEqual(normalizeCaixaProductResult("super-sete", superSete).result, {
    family: "column-draw",
    columns: [2, 9, 9, 8, 7, 7, 6],
  });
  assert.deepEqual(normalizeCaixaProductResult("mais-milionaria", maisMilionaria).result, {
    family: "number-draw-secondary",
    numbers: [2, 15, 17, 26, 29, 32],
    secondary: { kind: "clovers", values: [4, 5] },
  });
});

test("normalizes verified Loteca and Federal structures without forcing number draws", () => {
  const federalResult = normalizeCaixaProductResult("federal", federal).result;
  assert.deepEqual(federalResult, {
    family: "ticket-draw",
    prizes: [
      { position: 1, ticketNumber: "059074" },
      { position: 2, ticketNumber: "003557" },
      { position: 3, ticketNumber: "020563" },
      { position: 4, ticketNumber: "040449" },
      { position: 5, ticketNumber: "007802" },
    ],
  });

  const lotecaResult = normalizeCaixaProductResult("loteca", loteca).result;
  assert.equal(lotecaResult.family, "sports-prediction");
  if (lotecaResult.family === "sports-prediction" && lotecaResult.mode === "result") {
    assert.equal(lotecaResult.outcomes.length, 14);
    assert.deepEqual(lotecaResult.outcomes.slice(0, 3), ["home", "draw", "away"]);
  }
});

test("keeps unsupported operational products explicit", () => {
  assert.throws(
    () => normalizeCaixaProductResult("lotogol", quina),
    /No verified Caixa contest endpoint/,
  );
  assert.throws(
    () => normalizeCaixaProductResult("instantanea", quina),
    /No verified Caixa contest endpoint/,
  );
});

test("normalizes optional agenda fields without converting absence to zero", () => {
  assert.deepEqual(normalizeCaixaProductAgenda("quina", quina), {
    product: "quina",
    currentContest: 7130,
    nextContest: 7131,
    nextDrawDate: "2026-09-30",
    estimatedPrize: 13500000,
    accumulated: true,
  });

  assert.deepEqual(normalizeCaixaProductAgenda("federal", federal), {
    product: "federal",
    currentContest: 6104,
  });
});

test("CaixaProductSource uses verified product endpoints", async () => {
  let requestedUrl = "";
  const source = new CaixaProductSource(async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify(maisMilionaria), { status: 200 });
  });

  const result = await source.fetchResult("mais-milionaria", 393);
  assert.equal(
    requestedUrl,
    "https://servicebus2.caixa.gov.br/portaldeloterias/api/maismilionaria/393",
  );
  assert.equal(result.contestNumber, 393);
  assert.equal(result.source.provider, "caixa");
});
