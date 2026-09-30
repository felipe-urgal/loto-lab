import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, GeneratedGame } from "../src/domain/types.js";
import {
  generatePortfolioGames,
  generateUniformGames,
} from "../src/generator/generationPurpose.js";

function fingerprint(games: GeneratedGame[]): string {
  return games
    .map((game) => `${game.numbers.join("-")}:${game.luckyMonth ?? ""}`)
    .join("|");
}

function averageOverlap(games: GeneratedGame[]): number {
  const overlaps: number[] = [];
  for (let left = 0; left < games.length; left += 1) {
    for (let right = left + 1; right < games.length; right += 1) {
      overlaps.push(
        games[left]!.numbers.filter((number) => games[right]!.numbers.includes(number)).length,
      );
    }
  }
  return overlaps.reduce((sum, value) => sum + value, 0) / overlaps.length;
}

test("uniform generation is replayable from the same seed and inputs", () => {
  const options = {
    lottery: "mega-sena" as const,
    gameCount: 6,
    fixedCount: 0,
    seed: "uniform-replay",
    excludedNumbers: [60],
    constraints: { odd: { min: 2, max: 4 } },
  };

  const first = generateUniformGames(options);
  const second = generateUniformGames(options);

  assert.equal(fingerprint(first), fingerprint(second));
  assert.ok(first.every((game) => !game.numbers.includes(60)));
  assert.ok(first.every((game) => game.metadata.odd >= 2 && game.metadata.odd <= 4));
});

test("uniform selection does not depend on historical reference data", () => {
  const referenceA: Contest = {
    lottery: "mega-sena",
    number: 100,
    date: "2026-01-01",
    numbers: [1, 2, 3, 4, 5, 6],
  };
  const referenceB: Contest = {
    lottery: "mega-sena",
    number: 100,
    date: "2026-01-01",
    numbers: [50, 51, 52, 53, 54, 55],
  };
  const base = {
    lottery: "mega-sena" as const,
    gameCount: 5,
    fixedCount: 0,
    seed: "history-independent",
  };

  const first = generateUniformGames({ ...base, referenceContest: referenceA });
  const second = generateUniformGames({ ...base, referenceContest: referenceB });

  assert.deepEqual(
    first.map((game) => game.numbers),
    second.map((game) => game.numbers),
  );
});

test("uniform sampling property test catches large accidental number bias", () => {
  const counts = new Map<number, number>(
    Array.from({ length: 60 }, (_, index) => [index + 1, 0]),
  );

  for (let index = 0; index < 1_200; index += 1) {
    const [game] = generateUniformGames({
      lottery: "mega-sena",
      gameCount: 1,
      fixedCount: 0,
      seed: `bias-check-${index}`,
    });
    for (const number of game!.numbers) {
      counts.set(number, (counts.get(number) ?? 0) + 1);
    }
  }

  const observed = [...counts.values()];
  assert.equal(observed.reduce((sum, value) => sum + value, 0), 7_200);
  assert.ok(Math.min(...observed) >= 75);
  assert.ok(Math.max(...observed) <= 165);
});

test("portfolio purpose reduces or preserves pairwise overlap without historical scores", () => {
  const options = {
    lottery: "mega-sena" as const,
    gameCount: 8,
    fixedCount: 0,
    seed: "portfolio-coverage",
  };

  const uniform = generateUniformGames(options);
  const portfolio = generatePortfolioGames(options);

  assert.ok(averageOverlap(portfolio) <= averageOverlap(uniform));
  assert.equal(new Set(portfolio.flatMap((game) => game.numbers)).size >= 20, true);
});

test("Dia de Sorte uniform generation also replays the secondary field", () => {
  const options = {
    lottery: "dia-de-sorte" as const,
    gameCount: 4,
    fixedCount: 0,
    seed: "dia-month-replay",
  };

  assert.equal(
    fingerprint(generateUniformGames(options)),
    fingerprint(generateUniformGames(options)),
  );
  assert.ok(generateUniformGames(options).every((game) => Boolean(game.luckyMonth)));
});
