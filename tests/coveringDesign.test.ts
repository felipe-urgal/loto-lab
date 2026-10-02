import test from "node:test";
import assert from "node:assert/strict";
import { generateCoveringDesign } from "../src/generator/coveringDesign.js";

function keys(games: Array<{ numbers: number[] }>): string[] {
  return games.map((game) => game.numbers.join("-"));
}

test("covering design reaches complete pair coverage for a small known case", () => {
  const result = generateCoveringDesign({
    lottery: "mega-sena",
    poolNumbers: [1, 2, 3, 4, 5, 6, 7],
    ticketSize: 6,
    targetSize: 2,
    maxTickets: 7,
    pricePerTicketCents: 600,
  });

  assert.equal(result.report.targetSubsets, 21);
  assert.equal(result.report.coveredSubsets, 21);
  assert.equal(result.report.coverageRatio, 1);
  assert.equal(result.report.isCompleteCoverage, true);
  assert.ok(result.games.length <= 7);
  assert.equal(result.report.costCents, result.games.length * 600);
});

test("covering design is deterministic and never duplicates tickets", () => {
  const input = {
    lottery: "mega-sena" as const,
    poolNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
    ticketSize: 6,
    targetSize: 5,
    maxTickets: 4,
    pricePerTicketCents: 600,
  };
  const first = generateCoveringDesign(input);
  const second = generateCoveringDesign(input);

  assert.deepEqual(keys(first.games), keys(second.games));
  assert.equal(new Set(keys(first.games)).size, first.games.length);
  assert.ok(first.games.every((game) => game.numbers.every((number) => input.poolNumbers.includes(number))));
});

test("partial coverage never reports a complete guarantee", () => {
  const result = generateCoveringDesign({
    lottery: "mega-sena",
    poolNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    ticketSize: 6,
    targetSize: 5,
    maxTickets: 1,
    pricePerTicketCents: 600,
  });

  assert.equal(result.games.length, 1);
  assert.equal(result.report.isCompleteCoverage, false);
  assert.ok(result.report.coverageRatio > 0);
  assert.ok(result.report.coverageRatio < 1);
  assert.equal(result.report.coveredSubsets, 6);
  assert.equal(result.report.targetSubsets, 126);
});

test("budget caps selected tickets without exceeding cost", () => {
  const result = generateCoveringDesign({
    lottery: "mega-sena",
    poolNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
    ticketSize: 6,
    targetSize: 5,
    maxTickets: 10,
    pricePerTicketCents: 600,
    budgetCents: 1_200,
  });

  assert.ok(result.games.length <= 2);
  assert.ok(result.report.costCents <= 1_200);
});

test("coverage constraints are applied to candidate tickets", () => {
  const result = generateCoveringDesign({
    lottery: "mega-sena",
    poolNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
    ticketSize: 6,
    targetSize: 4,
    maxTickets: 4,
    pricePerTicketCents: 600,
    constraints: { odd: { min: 3, max: 3 } },
  });

  assert.ok(result.games.length > 0);
  assert.ok(result.games.every((game) => game.metadata.odd === 3));
});

test("covering design rejects unsafe combinatorial spaces", () => {
  assert.throws(
    () => generateCoveringDesign({
      lottery: "mega-sena",
      poolNumbers: Array.from({ length: 30 }, (_, index) => index + 1),
      ticketSize: 15,
      targetSize: 5,
      maxTickets: 10,
      pricePerTicketCents: 600,
    }),
    /safe limit/,
  );
});


test("covering design rejects excessive candidate-target incidence work", () => {
  assert.throws(
    () => generateCoveringDesign({
      lottery: "mega-sena",
      poolNumbers: Array.from({ length: 20 }, (_, index) => index + 1),
      ticketSize: 10,
      targetSize: 5,
      maxTickets: 10,
      pricePerTicketCents: 600,
    }),
    /incidence space exceeds safe limit/,
  );
});
