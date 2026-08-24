import test from "node:test";
import assert from "node:assert/strict";
import type { Contest } from "../src/domain/types.js";
import { generateLotofacilGames } from "../src/generator/lotofacil.js";

function adversarialHistory(): Contest[] {
  const historicallyDominant = [1, 2, 3, 4, 5, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
  const previousContest = Array.from({ length: 15 }, (_, index) => index + 1);

  return Array.from({ length: 30 }, (_, index) => ({
    lottery: "lotofacil" as const,
    number: 3700 + index,
    date: `2026-08-${String((index % 28) + 1).padStart(2, "0")}`,
    numbers: index === 29 ? previousContest : historicallyDominant,
  }));
}

test("Lotofácil default generation keeps the documented 7–11 repeat guardrail even when score pulls outside it", () => {
  const contests = adversarialHistory();
  const games = generateLotofacilGames(contests, {
    gameCount: 4,
    fixedCount: 8,
    generationMode: "diversified",
    seed: "lotofacil-readiness-default",
    // Force the shared core outside the previous draw. The remaining two
    // non-repeated numbers are historically dominant, creating pressure for
    // the score to prefer only five repeats unless the methodology guardrail
    // is enforced by the generator itself.
    fixedNumbers: [16, 17, 18, 19, 20, 21, 22, 23],
  });

  assert.equal(games.length, 4);
  for (const game of games) {
    const repeated = game.metadata.repeatedFromLastContest.length;
    assert.ok(repeated >= 7 && repeated <= 11, `expected 7–11 repeats, got ${repeated}`);
  }
});

test("Lotofácil explicit repeat constraint intentionally overrides the default methodology guardrail", () => {
  const contests = adversarialHistory();
  const games = generateLotofacilGames(contests, {
    gameCount: 1,
    fixedCount: 8,
    generationMode: "deterministic",
    fixedNumbers: [16, 17, 18, 19, 20, 21, 22, 23],
    constraints: { repeated: { min: 5, max: 5 } },
  });

  assert.equal(games.length, 1);
  assert.equal(games[0]!.metadata.repeatedFromLastContest.length, 5);
});

test("Lotofácil diversified portfolios remain reproducible and inside the repeat profile across seeds", () => {
  const contests = adversarialHistory();
  const seeds = ["a", "b", "c", "d", "e", "f"];

  for (const seed of seeds) {
    const options = {
      gameCount: 4,
      fixedCount: 8 as const,
      generationMode: "diversified" as const,
      seed: `lotofacil-readiness-${seed}`,
    };
    const first = generateLotofacilGames(contests, options);
    const replay = generateLotofacilGames(contests, options);

    assert.deepEqual(first, replay);
    assert.equal(new Set(first.map((game) => game.numbers.join("-"))).size, first.length);
    assert.ok(first.every((game) => {
      const repeated = game.metadata.repeatedFromLastContest.length;
      return repeated >= 7 && repeated <= 11;
    }));
  }
});
