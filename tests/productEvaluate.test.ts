import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateFederalTicket,
  evaluateLotecaBet,
} from "../src/checker/productEvaluate.js";
import type { BetSpec, DrawResult } from "../src/domain/lotteryCatalog.js";

test("Loteca supports simple, double and triple predictions and awards 13/14 tiers", () => {
  const bet: BetSpec = {
    family: "sports-prediction",
    mode: "result",
    predictions: [
      ["home"],
      ["draw", "away"],
      ["home", "draw", "away"],
      ["home"],
      ["home"],
      ["home"],
      ["home"],
      ["home"],
      ["home"],
      ["home"],
      ["home"],
      ["home"],
      ["home"],
      ["home"],
    ],
  };
  const result: DrawResult = {
    family: "sports-prediction",
    mode: "result",
    outcomes: [
      "home", "away", "draw", "away",
      "home", "home", "home", "home", "home", "home", "home", "home", "home", "home",
    ],
  };

  const checked = evaluateLotecaBet(bet, result);
  assert.equal(checked.hits, 13);
  assert.equal(checked.prizeTier, "13-acertos");
  assert.equal(checked.matchedMatches.includes(4), false);

  const perfect: BetSpec = {
    ...bet,
    predictions: bet.predictions.map((selection, index) =>
      index === 3 ? ["home", "away"] : selection),
  };
  assert.equal(evaluateLotecaBet(perfect, result).prizeTier, "14-acertos");
});

test("Loteca rejects invalid duplicated predictions", () => {
  const bet = {
    family: "sports-prediction",
    mode: "result",
    predictions: Array.from({ length: 14 }, () => ["home"] as const),
  } as unknown as BetSpec;
  (bet as { predictions: string[][] }).predictions[0] = ["home", "home"];
  const result: DrawResult = {
    family: "sports-prediction",
    mode: "result",
    outcomes: Array.from({ length: 14 }, () => "home"),
  };
  assert.throws(() => evaluateLotecaBet(bet, result), /duplicate predictions/);
});

test("Federal checks main prize, milhar, centena and dezena without forcing number draws", () => {
  const result: DrawResult = {
    family: "ticket-draw",
    prizes: [
      { position: 1, ticketNumber: "059074" },
      { position: 2, ticketNumber: "003557" },
      { position: 3, ticketNumber: "020563" },
      { position: 4, ticketNumber: "040449" },
      { position: 5, ticketNumber: "007802" },
    ],
  };

  const exact = evaluateFederalTicket(
    { family: "ticket-draw", ticketNumber: "59074" },
    result,
  );
  assert.equal(exact.mainPrizePosition, 1);
  assert.deepEqual(exact.milharPrizePositions, [1]);
  assert.deepEqual(exact.centenaPrizePositions, [1]);
  assert.deepEqual(exact.dezenaPrizePositions, [1]);

  const suffix = evaluateFederalTicket(
    { family: "ticket-draw", ticketNumber: "99074" },
    result,
  );
  assert.equal(suffix.mainPrizePosition, undefined);
  assert.deepEqual(suffix.milharPrizePositions, [1]);
  assert.deepEqual(suffix.centenaPrizePositions, [1]);
  assert.deepEqual(suffix.dezenaPrizePositions, [1]);
});
