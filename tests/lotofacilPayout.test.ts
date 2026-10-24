import test from "node:test";
import assert from "node:assert/strict";
import { generateLotofacilPayoutGames } from "../src/generator/lotofacilPayout.js";
import {
  evaluateLotofacilTicket,
  LOTOFACIL_MODEL,
  lotofacilTierProbabilities,
} from "../src/generator/lotofacilModel.js";
import { createSeededRandom } from "../src/generator/shared.js";

function uniformTicket(random: () => number): number[] {
  const numbers = Array.from({ length: 25 }, (_, index) => index + 1);
  for (let index = 0; index < 15; index += 1) {
    const pick = index + Math.floor(random() * (25 - index));
    [numbers[index], numbers[pick]] = [numbers[pick]!, numbers[index]!];
  }
  return numbers.slice(0, 15).sort((a, b) => a - b);
}

test("model vectors cover the 25 numbers", () => {
  assert.equal(LOTOFACIL_MODEL.popularity.length, 25);
  assert.equal(LOTOFACIL_MODEL.theta.length, 25);
});

test("tier probabilities are a distribution and match the hypergeometric law when uniform", () => {
  const ticket = Array.from({ length: 15 }, (_, index) => index + 1);
  const uniform = lotofacilTierProbabilities(ticket, Array(25).fill(0));
  assert.ok(Math.abs(uniform.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
  assert.ok(Math.abs(uniform[15]! - 1 / 3_268_760) < 1e-12);
  assert.ok(Math.abs(uniform[14]! - 150 / 3_268_760) < 1e-12);
  const tilted = lotofacilTierProbabilities(ticket, LOTOFACIL_MODEL.theta);
  assert.ok(Math.abs(tilted.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
});

test("evIndex of uniform tickets averages 1", () => {
  const random = createSeededRandom("lotofacil-ev-normalisation");
  let total = 0;
  const draws = 1_500;
  for (let index = 0; index < draws; index += 1) total += evaluateLotofacilTicket(uniformTicket(random)).evIndex;
  assert.ok(Math.abs(total / draws - 1) < 0.02);
});

test("payout games are replayable and beat the uniform baseline", () => {
  const options = { gameCount: 5, fixedCount: 0, seed: "lotofacil-payout" };
  const first = generateLotofacilPayoutGames(options);
  assert.deepEqual(first.games, generateLotofacilPayoutGames(options).games);
  assert.equal(first.games.length, 5);
  assert.equal(new Set(first.games.map((game) => game.numbers.join("-"))).size, 5);
  assert.ok(first.games.every((game) => game.numbers.length === 15 && new Set(game.numbers).size === 15));
  assert.ok(first.report.averageEvIndex > 1.08, `average ev ${first.report.averageEvIndex}`);
  assert.ok(first.report.shareIndex.every((value) => value < 1));
  assert.ok(first.report.maxPairOverlap <= 14);
});

test("payout respects fixed, excluded and structural constraints", () => {
  const { games } = generateLotofacilPayoutGames({
    gameCount: 3,
    fixedCount: 4,
    seed: "lotofacil-constraints",
    fixedNumbers: [13],
    excludedNumbers: [6, 16],
    constraints: { odd: { min: 6, max: 9 } },
  });
  for (const game of games) {
    assert.ok(game.numbers.includes(13));
    assert.ok(!game.numbers.includes(6) && !game.numbers.includes(16));
    assert.ok(game.metadata.odd >= 6 && game.metadata.odd <= 9);
    assert.ok(game.fixedNumbers.length === 0 || game.fixedNumbers.length === 4);
  }
});

test("payout rejects invalid selections", () => {
  assert.throws(() => generateLotofacilPayoutGames({ gameCount: 1, fixedCount: 1, seed: "x", fixedNumbers: [5], excludedNumbers: [5] }));
  assert.throws(() => generateLotofacilPayoutGames({ gameCount: 1, fixedCount: 0, seed: "x", fixedNumbers: [5] }));
  assert.throws(() => generateLotofacilPayoutGames({ gameCount: 1, fixedCount: 0, seed: "x", excludedNumbers: Array.from({ length: 11 }, (_, index) => index + 1) }));
});
