import test from "node:test";
import assert from "node:assert/strict";
import { generateMaisMilionariaPayoutGames } from "../src/generator/maisMilionariaPayout.js";
import {
  evaluateMaisMilionariaTicket,
  MAIS_MILIONARIA_MODEL,
  maisMilionariaShareIndex,
} from "../src/generator/maisMilionariaModel.js";
import { createSeededRandom } from "../src/generator/shared.js";

function uniformTicket(random: () => number): number[] {
  const drawn = new Set<number>();
  while (drawn.size < 6) drawn.add(1 + Math.floor(random() * 50));
  return [...drawn].sort((a, b) => a - b);
}

test("model covers the 50 numbers and is centered", () => {
  assert.equal(MAIS_MILIONARIA_MODEL.popularity.length, 50);
  const mean = [...MAIS_MILIONARIA_MODEL.popularity].reduce((sum: number, value: number) => sum + value, 0) / 50;
  assert.ok(Math.abs(mean) < 0.005);
});

test("share index and evIndex are normalised to 1 for uniform tickets", () => {
  const random = createSeededRandom("mm-normalisation");
  let ev = 0;
  let share = 0;
  const draws = 40_000;
  for (let index = 0; index < draws; index += 1) {
    const ticket = uniformTicket(random);
    ev += evaluateMaisMilionariaTicket(ticket).evIndex;
    share += maisMilionariaShareIndex(ticket, 5);
  }
  assert.ok(Math.abs(ev / draws - 1) < 0.01, `ev ${ev / draws}`);
  assert.ok(Math.abs(share / draws - 1) < 0.03, `share ${share / draws}`);
});

test("payout games are replayable, carry clovers and beat the baseline", () => {
  const options = { gameCount: 6, fixedCount: 0, seed: "mm-payout" };
  const first = generateMaisMilionariaPayoutGames(options);
  assert.deepEqual(first.games, generateMaisMilionariaPayoutGames(options).games);
  assert.equal(new Set(first.games.map((game) => game.numbers.join("-"))).size, 6);
  assert.ok(first.games.every((game) => game.numbers.length === 6 && new Set(game.numbers).size === 6));
  assert.ok(first.games.every((game) => game.secondary?.kind === "clovers" && game.secondary.values.length === 2));
  assert.ok(first.report.averageEvIndex > 1.08, `average ev ${first.report.averageEvIndex}`);
  assert.ok(first.report.maxPairOverlap <= 2);
  const four = generateMaisMilionariaPayoutGames({ ...options, cloverCount: 4 });
  assert.ok(four.games.every((game) => game.secondary?.values.length === 4));
  assert.throws(() => generateMaisMilionariaPayoutGames({ ...options, cloverCount: 1 }));
});

test("payout respects fixed, excluded and structural constraints", () => {
  const { games } = generateMaisMilionariaPayoutGames({
    gameCount: 3,
    fixedCount: 2,
    seed: "mm-constraints",
    fixedNumbers: [13],
    excludedNumbers: [40, 35],
    constraints: { odd: { min: 2, max: 4 } },
  });
  for (const game of games) {
    assert.ok(game.numbers.includes(13));
    assert.ok(!game.numbers.includes(40) && !game.numbers.includes(35));
    assert.ok(game.metadata.odd >= 2 && game.metadata.odd <= 4);
    assert.ok(game.fixedNumbers.length === 0 || game.fixedNumbers.length === 2);
  }
});

test("payout rejects invalid selections", () => {
  assert.throws(() => generateMaisMilionariaPayoutGames({ gameCount: 1, fixedCount: 1, seed: "x", fixedNumbers: [5], excludedNumbers: [5] }));
  assert.throws(() => generateMaisMilionariaPayoutGames({ gameCount: 1, fixedCount: 0, seed: "x", fixedNumbers: [5] }));
  assert.throws(() => generateMaisMilionariaPayoutGames({ gameCount: 0, fixedCount: 0, seed: "x" }));
});
