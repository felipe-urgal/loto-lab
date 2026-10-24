import test from "node:test";
import assert from "node:assert/strict";
import { generateDuplaSenaPayoutGames } from "../src/generator/duplaSenaPayout.js";
import {
  DUPLA_SENA_MODEL,
  duplaSenaShareIndex,
  evaluateDuplaSenaTicket,
} from "../src/generator/duplaSenaModel.js";
import { createSeededRandom } from "../src/generator/shared.js";

function uniformTicket(random: () => number): number[] {
  const drawn = new Set<number>();
  while (drawn.size < 6) drawn.add(1 + Math.floor(random() * 50));
  return [...drawn].sort((a, b) => a - b);
}

test("model covers the 50 numbers and is centered", () => {
  assert.equal(DUPLA_SENA_MODEL.popularity.length, 50);
  const mean = [...DUPLA_SENA_MODEL.popularity].reduce((sum: number, value: number) => sum + value, 0) / 50;
  assert.ok(Math.abs(mean) < 0.005);
});

test("share index and evIndex are normalised to 1 for uniform tickets", () => {
  const random = createSeededRandom("dupla-normalisation");
  let ev = 0;
  let share = 0;
  const draws = 40_000;
  for (let index = 0; index < draws; index += 1) {
    const ticket = uniformTicket(random);
    ev += evaluateDuplaSenaTicket(ticket).evIndex;
    share += duplaSenaShareIndex(ticket, 4);
  }
  assert.ok(Math.abs(ev / draws - 1) < 0.01, `ev ${ev / draws}`);
  assert.ok(Math.abs(share / draws - 1) < 0.02, `share ${share / draws}`);
});

test("payout games are replayable and beat the uniform baseline", () => {
  const options = { gameCount: 6, fixedCount: 0, seed: "dupla-payout" };
  const first = generateDuplaSenaPayoutGames(options);
  assert.deepEqual(first.games, generateDuplaSenaPayoutGames(options).games);
  assert.notDeepEqual(
    first.games.map((game) => game.numbers),
    generateDuplaSenaPayoutGames({ ...options, seed: "dupla-other" }).games.map((game) => game.numbers),
  );
  assert.equal(new Set(first.games.map((game) => game.numbers.join("-"))).size, 6);
  assert.ok(first.games.every((game) => game.numbers.length === 6 && new Set(game.numbers).size === 6));
  assert.ok(first.report.averageEvIndex > 1.1, `average ev ${first.report.averageEvIndex}`);
  assert.ok(first.report.jackpotShareIndex.every((value) => value < 0.7));
  assert.ok(first.report.maxPairOverlap <= 2);
});

test("payout respects fixed, excluded and structural constraints", () => {
  const { games } = generateDuplaSenaPayoutGames({
    gameCount: 3,
    fixedCount: 2,
    seed: "dupla-constraints",
    fixedNumbers: [13],
    excludedNumbers: [40, 20],
    constraints: { odd: { min: 2, max: 4 } },
  });
  for (const game of games) {
    assert.ok(game.numbers.includes(13));
    assert.ok(!game.numbers.includes(40) && !game.numbers.includes(20));
    assert.ok(game.metadata.odd >= 2 && game.metadata.odd <= 4);
    assert.ok(game.fixedNumbers.length === 0 || game.fixedNumbers.length === 2);
  }
});

test("payout rejects invalid selections", () => {
  assert.throws(() => generateDuplaSenaPayoutGames({ gameCount: 1, fixedCount: 1, seed: "x", fixedNumbers: [5], excludedNumbers: [5] }));
  assert.throws(() => generateDuplaSenaPayoutGames({ gameCount: 1, fixedCount: 0, seed: "x", fixedNumbers: [5] }));
  assert.throws(() => generateDuplaSenaPayoutGames({ gameCount: 0, fixedCount: 0, seed: "x" }));
});
