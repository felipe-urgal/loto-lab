import test from "node:test";
import assert from "node:assert/strict";
import { generateQuinaPayoutGames } from "../src/generator/quinaPayout.js";
import { evaluateQuinaTicket, QUINA_MODEL, quinaShareIndex } from "../src/generator/quinaModel.js";
import { createSeededRandom } from "../src/generator/shared.js";

function uniformTicket(random: () => number): number[] {
  const drawn = new Set<number>();
  while (drawn.size < 5) drawn.add(1 + Math.floor(random() * 80));
  return [...drawn].sort((a, b) => a - b);
}

test("model covers the 80 numbers", () => {
  assert.equal(QUINA_MODEL.popularity.length, 80);
  const mean = [...QUINA_MODEL.popularity].reduce((sum: number, value: number) => sum + value, 0) / 80;
  assert.ok(Math.abs(mean) < 0.005);
});

test("share index and evIndex are normalised to 1 for uniform tickets", () => {
  const random = createSeededRandom("quina-normalisation");
  let ev = 0;
  let share = 0;
  const draws = 30_000;
  for (let index = 0; index < draws; index += 1) {
    const ticket = uniformTicket(random);
    ev += evaluateQuinaTicket(ticket).evIndex;
    share += quinaShareIndex(ticket, 4);
  }
  assert.ok(Math.abs(ev / draws - 1) < 0.02, `ev ${ev / draws}`);
  assert.ok(Math.abs(share / draws - 1) < 0.03, `share ${share / draws}`);
});

test("payout games are replayable and beat the uniform baseline", () => {
  const options = { gameCount: 6, fixedCount: 0, seed: "quina-payout" };
  const first = generateQuinaPayoutGames(options);
  assert.deepEqual(first.games, generateQuinaPayoutGames(options).games);
  assert.notDeepEqual(
    first.games.map((game) => game.numbers),
    generateQuinaPayoutGames({ ...options, seed: "quina-other" }).games.map((game) => game.numbers),
  );
  assert.equal(new Set(first.games.map((game) => game.numbers.join("-"))).size, 6);
  assert.ok(first.games.every((game) => game.numbers.length === 5 && new Set(game.numbers).size === 5));
  assert.ok(first.report.averageEvIndex > 1.15, `average ev ${first.report.averageEvIndex}`);
  assert.ok(first.report.jackpotShareIndex.every((value) => value < 0.6));
  assert.ok(first.report.maxPairOverlap <= 2);
});

test("payout respects fixed, excluded and structural constraints", () => {
  const { games } = generateQuinaPayoutGames({
    gameCount: 4,
    fixedCount: 1,
    seed: "quina-constraints",
    fixedNumbers: [13],
    excludedNumbers: [61, 70],
    constraints: { odd: { min: 2, max: 3 } },
  });
  for (const game of games) {
    assert.ok(game.numbers.includes(13));
    assert.ok(!game.numbers.includes(61) && !game.numbers.includes(70));
    assert.ok(game.metadata.odd >= 2 && game.metadata.odd <= 3);
  }
});

test("payout rejects invalid selections", () => {
  assert.throws(() => generateQuinaPayoutGames({ gameCount: 1, fixedCount: 1, seed: "x", fixedNumbers: [5], excludedNumbers: [5] }));
  assert.throws(() => generateQuinaPayoutGames({ gameCount: 1, fixedCount: 0, seed: "x", fixedNumbers: [5] }));
  assert.throws(() => generateQuinaPayoutGames({ gameCount: 0, fixedCount: 0, seed: "x" }));
});
