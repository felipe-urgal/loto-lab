import test from "node:test";
import assert from "node:assert/strict";
import { generateMegaSenaPayoutGames } from "../src/generator/megaSenaPayout.js";
import {
  MEGA_POPULARITY_MODEL,
  megaSenaPopularityScore,
  megaSenaShareIndex,
} from "../src/generator/megaSenaPopularity.js";
import { createSeededRandom } from "../src/generator/shared.js";

function uniformDraw(random: () => number): number[] {
  const drawn = new Set<number>();
  while (drawn.size < 6) drawn.add(1 + Math.floor(random() * 60));
  return [...drawn].sort((a, b) => a - b);
}

test("popularity model covers the 60 numbers and is centered", () => {
  assert.equal(MEGA_POPULARITY_MODEL.weights.length, 60);
  const mean = MEGA_POPULARITY_MODEL.weights.reduce((sum, value) => sum + value, 0) / 60;
  assert.ok(Math.abs(mean) < 0.005);
});

test("share index is normalised so a uniform ticket averages 1", () => {
  const random = createSeededRandom("share-index-normalisation");
  let total = 0;
  const draws = 40_000;
  for (let index = 0; index < draws; index += 1) total += megaSenaShareIndex(uniformDraw(random));
  assert.ok(Math.abs(total / draws - 1) < 0.03);
});

test("payout games are replayable from the same seed", () => {
  const options = { gameCount: 6, fixedCount: 0, seed: "payout-replay" };
  assert.deepEqual(generateMegaSenaPayoutGames(options).games, generateMegaSenaPayoutGames(options).games);
  assert.notDeepEqual(
    generateMegaSenaPayoutGames(options).games.map((game) => game.numbers),
    generateMegaSenaPayoutGames({ ...options, seed: "payout-other" }).games.map((game) => game.numbers),
  );
});

test("payout games share less than a uniform ticket and keep overlap low", () => {
  const { games, report } = generateMegaSenaPayoutGames({ gameCount: 8, fixedCount: 0, seed: "payout-quality" });
  assert.equal(games.length, 8);
  assert.equal(new Set(games.map((game) => game.numbers.join("-"))).size, 8);
  assert.ok(games.every((game) => game.numbers.length === 6 && new Set(game.numbers).size === 6));
  assert.ok(report.averageShareIndex < 0.6, `average share index ${report.averageShareIndex}`);
  assert.ok(report.maxPairOverlap <= 2);
  assert.ok(games.every((game, index) => megaSenaPopularityScore(game.numbers) < 0 && report.shareIndex[index]! < 1));
});

test("payout respects fixed, excluded and structural constraints", () => {
  const { games } = generateMegaSenaPayoutGames({
    gameCount: 4,
    fixedCount: 2,
    seed: "payout-constraints",
    fixedNumbers: [10],
    excludedNumbers: [40, 50],
    constraints: { odd: { min: 2, max: 4 } },
  });
  for (const game of games) {
    assert.ok(game.numbers.includes(10));
    assert.ok(!game.numbers.includes(40) && !game.numbers.includes(50));
    assert.ok(game.metadata.odd >= 2 && game.metadata.odd <= 4);
    assert.equal(game.fixedNumbers.length, 2);
  }
  assert.equal(new Set(games.map((game) => game.fixedNumbers.join("-"))).size, 1);
});

test("payout rejects invalid selections", () => {
  assert.throws(() => generateMegaSenaPayoutGames({ gameCount: 1, fixedCount: 1, seed: "x", fixedNumbers: [5], excludedNumbers: [5] }));
  assert.throws(() => generateMegaSenaPayoutGames({ gameCount: 1, fixedCount: 0, seed: "x", fixedNumbers: [5] }));
  assert.throws(() => generateMegaSenaPayoutGames({ gameCount: 0, fixedCount: 0, seed: "x" }));
});
