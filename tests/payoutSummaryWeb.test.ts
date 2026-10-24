import test from "node:test";
import assert from "node:assert/strict";
import { payoutSummaryMarkup } from "../web/src/features/generationV2/payout.js";
import { describePayoutModelAge } from "../src/generator/payoutModelAge.js";

test("payout summary is empty outside the payout mode", () => {
  assert.equal(payoutSummaryMarkup({ seed: "x" }), "");
  assert.equal(payoutSummaryMarkup({ payout: null }), "");
  assert.equal(payoutSummaryMarkup({ payout: { strategy: "x" } }), "");
});

test("payout summary shows the expected-return delta per game", () => {
  const html = payoutSummaryMarkup({
    payout: {
      model: "quina-ev-v1",
      fitThroughContest: 7150,
      averageEvIndex: 1.27,
      evIndex: [1.31, 1.23],
      modelAge: { ageContests: 10, stale: false },
    },
  });
  assert.match(html, /\+27%/);
  assert.match(html, /\+31%/);
  assert.match(html, /quina-ev-v1/);
  assert.match(html, /#7150/);
  assert.doesNotMatch(html, /Reajuste recomendado/);
});

test("payout summary translates the Mega-Sena share index and flags a stale model", () => {
  const html = payoutSummaryMarkup({
    payout: {
      popularityModel: "mega-popularity-v1",
      averageShareIndex: 0.25,
      shareIndex: [0.2, 0.3],
      modelAge: { ageContests: 150, stale: true },
    },
  });
  assert.match(html, /4,0× menos/);
  assert.match(html, /Reajuste recomendado/);
  assert.match(html, /150 concursos/);
});

test("payout model age flags models older than about one year of contests", () => {
  assert.equal(describePayoutModelAge("mega-sena", 3073, 3100).stale, false);
  assert.equal(describePayoutModelAge("mega-sena", 3073, 3300).stale, true);
  assert.equal(describePayoutModelAge("quina", 7150, 7300).stale, false);
  assert.equal(describePayoutModelAge("quina", 7150, 7500).stale, true);
  assert.equal(describePayoutModelAge("mega-sena", 3073, 3000).ageContests, 0);
  assert.equal(describePayoutModelAge("mega-sena", 3073, undefined).latestContest, null);
});
