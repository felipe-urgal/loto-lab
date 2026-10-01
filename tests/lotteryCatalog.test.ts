import test from "node:test";
import assert from "node:assert/strict";
import {
  LOTTERY_CATALOG,
  getLotteryCatalogEntry,
  isSupportedLotteryId,
  supportsLotteryCapability,
  type BetSpec,
  type DrawResult,
  type LotteryProductId,
} from "../src/domain/lotteryCatalog.js";

const EXPECTED_IDS: LotteryProductId[] = [
  "mega-sena",
  "lotofacil",
  "dia-de-sorte",
  "quina",
  "lotomania",
  "dupla-sena",
  "mais-milionaria",
  "timemania",
  "super-sete",
  "loteca",
  "lotogol",
  "federal",
  "instantanea",
];

test("lottery catalog exposes every current product family without enabling unsupported integrations", () => {
  assert.deepEqual(Object.keys(LOTTERY_CATALOG).sort(), [...EXPECTED_IDS].sort());

  assert.equal(getLotteryCatalogEntry("mega-sena").enabled, true);
  assert.equal(getLotteryCatalogEntry("lotofacil").enabled, true);
  assert.equal(getLotteryCatalogEntry("dia-de-sorte").enabled, true);

  assert.equal(getLotteryCatalogEntry("quina").enabled, true);
  assert.equal(getLotteryCatalogEntry("lotomania").enabled, true);
  assert.equal(getLotteryCatalogEntry("dupla-sena").enabled, true);
  assert.equal(getLotteryCatalogEntry("mais-milionaria").enabled, true);
  assert.equal(getLotteryCatalogEntry("timemania").enabled, true);
  assert.equal(getLotteryCatalogEntry("super-sete").enabled, true);
  assert.equal(getLotteryCatalogEntry("lotogol").enabled, false);
  assert.equal(getLotteryCatalogEntry("instantanea").enabled, false);
});

test("capabilities describe structural differences without checking lottery names", () => {
  assert.equal(supportsLotteryCapability("dia-de-sorte", "secondaryFields"), true);
  assert.equal(supportsLotteryCapability("super-sete", "columns"), true);
  assert.equal(supportsLotteryCapability("loteca", "sportsPrediction"), true);
  assert.equal(supportsLotteryCapability("federal", "ticket"), true);
  assert.equal(supportsLotteryCapability("instantanea", "instantProduct"), true);
  assert.equal(supportsLotteryCapability("instantanea", "history"), false);
});

test("supported lottery compatibility includes integrated numeric modalities", () => {
  assert.equal(isSupportedLotteryId("mega-sena"), true);
  assert.equal(isSupportedLotteryId("quina"), true);
  assert.equal(isSupportedLotteryId("lotomania"), true);
  assert.equal(isSupportedLotteryId("dupla-sena"), true);
  assert.equal(isSupportedLotteryId("mais-milionaria"), true);
  assert.equal(isSupportedLotteryId("timemania"), true);
  assert.equal(isSupportedLotteryId("super-sete"), true);
  assert.equal(isSupportedLotteryId("lotogol"), false);
});

test("bet and draw contracts discriminate real product families", () => {
  const bets: BetSpec[] = [
    { family: "number-draw", numbers: [1, 2, 3, 4, 5, 6] },
    {
      family: "number-draw-secondary",
      numbers: [1, 2, 3, 4, 5, 6],
      secondary: { kind: "clovers", values: [1, 2] },
    },
    { family: "dual-number-draw", numbers: [1, 2, 3, 4, 5, 6] },
    { family: "column-draw", columns: [1, 2, 3, 4, 5, 6, 7] },
    { family: "sports-prediction", mode: "result", predictions: ["home", "draw", "away"] },
    { family: "ticket-draw", ticketNumber: "12345" },
    { family: "instant-product", productCode: "sample" },
  ];

  const results: DrawResult[] = [
    { family: "number-draw", numbers: [1, 2, 3, 4, 5, 6] },
    {
      family: "dual-number-draw",
      draws: [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]],
    },
    { family: "sports-prediction", mode: "score", outcomes: [{ home: 1, away: 0 }] },
    { family: "ticket-draw", prizes: [{ position: 1, ticketNumber: "12345" }] },
  ];

  assert.equal(bets.length, 7);
  assert.equal(results.length, 4);
});
