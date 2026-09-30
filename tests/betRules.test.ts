import test from "node:test";
import assert from "node:assert/strict";
import {
  BetSizeOutOfRangeError,
  getOfficialBetRule,
  quoteOfficialBet,
  simpleEquivalentCount,
} from "../src/domain/betRules.js";

test("official bet fixtures match selected CAIXA price and top-prize rows", () => {
  assert.deepEqual(quoteOfficialBet("mega-sena", 6), {
    product: "mega-sena",
    betSize: 6,
    gameCount: 1,
    simpleEquivalentCount: 1,
    pricePerBetCents: 600,
    totalPriceCents: 600,
    topPrizeOneIn: 50063860,
    rule: {
      version: "caixa-2026-09-30",
      effectiveFrom: "2026-09-30",
      verifiedAt: "2026-09-30",
      sourceUrl: "https://loterias.caixa.gov.br/Paginas/mega-sena.aspx",
    },
  });
  assert.equal(quoteOfficialBet("mega-sena", 20)?.pricePerBetCents, 23256000);
  assert.equal(quoteOfficialBet("mega-sena", 20)?.topPrizeOneIn, 1292);

  assert.equal(quoteOfficialBet("lotofacil", 16)?.simpleEquivalentCount, 16);
  assert.equal(quoteOfficialBet("lotofacil", 16)?.pricePerBetCents, 5600);
  assert.equal(quoteOfficialBet("lotofacil", 20)?.topPrizeOneIn, 211);

  assert.equal(quoteOfficialBet("quina", 15)?.pricePerBetCents, 900900);
  assert.equal(quoteOfficialBet("quina", 15)?.topPrizeOneIn, 8005);

  assert.equal(quoteOfficialBet("dupla-sena", 15)?.pricePerBetCents, 1501500);
  assert.equal(quoteOfficialBet("dupla-sena", 15)?.topPrizeOneIn, 3174);
});

test("simple-equivalent count is deterministic combinatorics", () => {
  assert.equal(simpleEquivalentCount(6, 6), 1);
  assert.equal(simpleEquivalentCount(10, 6), 210);
  assert.equal(simpleEquivalentCount(20, 15), 15504);
  assert.equal(simpleEquivalentCount(15, 5), 3003);
});

test("batch quote multiplies price but keeps per-bet official probability", () => {
  const quote = quoteOfficialBet("mega-sena", 7, 3);
  assert.equal(quote?.simpleEquivalentCount, 7);
  assert.equal(quote?.pricePerBetCents, 4200);
  assert.equal(quote?.totalPriceCents, 12600);
  assert.equal(quote?.topPrizeOneIn, 7151980);
});

test("invalid cardinality fails with a stable specific error", () => {
  assert.throws(
    () => quoteOfficialBet("mega-sena", 5),
    (error: unknown) => error instanceof BetSizeOutOfRangeError
      && error.code === "BET_SIZE_OUT_OF_RANGE"
      && error.minBetSize === 6
      && error.maxBetSize === 20,
  );
});

test("unknown official price/probability remains unknown", () => {
  assert.equal(getOfficialBetRule("dia-de-sorte"), undefined);
  assert.equal(quoteOfficialBet("dia-de-sorte", 7), undefined);
});
