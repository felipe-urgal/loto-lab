import test from "node:test";
import assert from "node:assert/strict";
import { generateTimemaniaPayoutGames } from "../src/generator/timemaniaPayout.js";
import {
  evaluateTimemaniaTicket,
  TIMEMANIA_MODEL,
  timemaniaShareIndex,
} from "../src/generator/timemaniaModel.js";
import { createSeededRandom } from "../src/generator/shared.js";

function uniformTicket(random: () => number): number[] {
  const drawn = new Set<number>();
  while (drawn.size < 10) drawn.add(1 + Math.floor(random() * 80));
  return [...drawn].sort((a, b) => a - b);
}

const team = "FLAMENGO/RJ";

test("model covers the 80 numbers and is centered", () => {
  assert.equal(TIMEMANIA_MODEL.popularity.length, 80);
  const mean = [...TIMEMANIA_MODEL.popularity].reduce((sum: number, value: number) => sum + value, 0) / 80;
  assert.ok(Math.abs(mean) < 0.005);
});

test("share index and evIndex are normalised to 1 for uniform tickets", () => {
  const random = createSeededRandom("timemania-normalisation");
  let ev = 0;
  let share = 0;
  const draws = 30_000;
  for (let index = 0; index < draws; index += 1) {
    const ticket = uniformTicket(random);
    ev += evaluateTimemaniaTicket(ticket).evIndex;
    share += timemaniaShareIndex(ticket, 5);
  }
  assert.ok(Math.abs(ev / draws - 1) < 0.01, `ev ${ev / draws}`);
  assert.ok(Math.abs(share / draws - 1) < 0.03, `share ${share / draws}`);
});

test("payout games have 10 numbers, carry the chosen team and beat the baseline", () => {
  const options = { gameCount: 6, fixedCount: 0, seed: "timemania-payout", favoriteTeam: team };
  const first = generateTimemaniaPayoutGames(options);
  assert.deepEqual(first.games, generateTimemaniaPayoutGames(options).games);
  assert.equal(new Set(first.games.map((game) => game.numbers.join("-"))).size, 6);
  assert.ok(first.games.every((game) => game.numbers.length === 10 && new Set(game.numbers).size === 10));
  assert.ok(first.games.every((game) => game.secondary?.kind === "favorite-team" && game.secondary.values[0] === team));
  assert.ok(first.report.averageEvIndex > 1.08, `average ev ${first.report.averageEvIndex}`);
  assert.ok(first.report.jackpotShareIndex.every((value) => value < 0.8));
  assert.ok(first.report.maxPairOverlap <= 3);
});

test("payout requires an explicit favorite team", () => {
  assert.throws(
    () => generateTimemaniaPayoutGames({ gameCount: 1, fixedCount: 0, seed: "x" }),
    /requires an explicit Time do Coração/,
  );
});

test("payout respects fixed, excluded and structural constraints", () => {
  const { games } = generateTimemaniaPayoutGames({
    gameCount: 3,
    fixedCount: 3,
    seed: "timemania-constraints",
    favoriteTeam: team,
    fixedNumbers: [13],
    excludedNumbers: [70, 61],
    constraints: { odd: { min: 4, max: 6 } },
  });
  for (const game of games) {
    assert.ok(game.numbers.includes(13));
    assert.ok(!game.numbers.includes(70) && !game.numbers.includes(61));
    assert.ok(game.metadata.odd >= 4 && game.metadata.odd <= 6);
    assert.ok(game.fixedNumbers.length === 0 || game.fixedNumbers.length === 3);
  }
});

test("payout rejects invalid selections", () => {
  const base = { gameCount: 1, fixedCount: 1, seed: "x", favoriteTeam: team };
  assert.throws(() => generateTimemaniaPayoutGames({ ...base, fixedNumbers: [5], excludedNumbers: [5] }));
  assert.throws(() => generateTimemaniaPayoutGames({ ...base, fixedCount: 0, fixedNumbers: [5] }));
  assert.throws(() => generateTimemaniaPayoutGames({ ...base, gameCount: 0 }));
});
