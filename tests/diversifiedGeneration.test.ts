import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, GeneratedGame } from "../src/domain/types.js";
import { generateMegaSenaGames } from "../src/generator/megaSena.js";
import { generateLotofacilGames } from "../src/generator/lotofacil.js";
import { generateDiaDeSorteGames } from "../src/generator/diaDeSorte.js";

function fingerprint(games: GeneratedGame[]): string {
  return games
    .map((game) => `${game.numbers.join("-")}:${game.luckyMonth ?? ""}`)
    .join("|");
}

function coreFingerprint(games: GeneratedGame[]): string {
  return games[0]?.fixedNumbers.join("-") ?? "";
}

function sharesOneCore(games: GeneratedGame[]): boolean {
  const core = coreFingerprint(games);
  return games.every((game) => game.fixedNumbers.join("-") === core);
}

function megaContests(): Contest[] {
  return Array.from({ length: 30 }, (_, index) => ({
    lottery: "mega-sena" as const,
    number: 2800 + index,
    date: `2026-07-${String((index % 28) + 1).padStart(2, "0")}`,
    numbers: Array.from({ length: 6 }, (_, offset) => ((index * 7 + offset * 11) % 60) + 1)
      .sort((a, b) => a - b),
  }));
}

function lotofacilContests(): Contest[] {
  return Array.from({ length: 24 }, (_, index) => {
    const start = (index * 3) % 25;
    return {
      lottery: "lotofacil" as const,
      number: 3600 + index,
      date: `2026-07-${String(index + 1).padStart(2, "0")}`,
      numbers: Array.from({ length: 15 }, (_, offset) => ((start + offset) % 25) + 1)
        .sort((a, b) => a - b),
    };
  });
}

function diaContests(): Contest[] {
  const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho"];
  return Array.from({ length: 24 }, (_, index) => ({
    lottery: "dia-de-sorte" as const,
    number: 1200 + index,
    date: `2026-07-${String(index + 1).padStart(2, "0")}`,
    numbers: Array.from({ length: 7 }, (_, offset) => ((index * 4 + offset * 5) % 31) + 1)
      .sort((a, b) => a - b),
    luckyMonth: months[index % months.length],
  }));
}

const SEEDS = ["seed-a", "seed-b", "seed-c", "seed-d", "seed-e", "seed-f", "seed-g", "seed-h"];

test("diversified Mega-Sena generation is reproducible and diversifies the shared core", () => {
  const contests = megaContests();
  const first = generateMegaSenaGames(contests, {
    gameCount: 3,
    generationMode: "diversified",
    seed: "mega-seed-a",
  });
  const replay = generateMegaSenaGames(contests, {
    gameCount: 3,
    generationMode: "diversified",
    seed: "mega-seed-a",
  });
  const variants = SEEDS.map((seed) =>
    generateMegaSenaGames(contests, { gameCount: 3, generationMode: "diversified", seed: `mega-${seed}` }),
  );

  assert.deepEqual(first, replay);
  assert.ok(new Set(variants.map(fingerprint)).size > 1);
  assert.ok(new Set(variants.map(coreFingerprint)).size > 1);
  assert.ok(variants.every(sharesOneCore));
  assert.ok(variants.every((games) => games[0]!.fixedNumbers.length === 3));
});

test("diversified Lotofacil generation diversifies the shared core and preserves its size", () => {
  const contests = lotofacilContests();
  const replaySeed = "loto-replay";
  const first = generateLotofacilGames(contests, {
    gameCount: 2,
    fixedCount: 8,
    generationMode: "diversified",
    seed: replaySeed,
  });
  const replay = generateLotofacilGames(contests, {
    gameCount: 2,
    fixedCount: 8,
    generationMode: "diversified",
    seed: replaySeed,
  });
  const variants = SEEDS.map((seed) =>
    generateLotofacilGames(contests, {
      gameCount: 2,
      fixedCount: 8,
      generationMode: "diversified",
      seed: `loto-${seed}`,
    }),
  );

  assert.deepEqual(first, replay);
  assert.ok(new Set(variants.map(fingerprint)).size > 1);
  assert.ok(new Set(variants.map(coreFingerprint)).size > 1);
  assert.ok(variants.every(sharesOneCore));
  assert.ok(variants.every((games) => games.every((game) => {
    assert.equal(game.numbers.length, 15);
    assert.equal(game.fixedNumbers.length, 8);
    assert.equal(game.variableNumbers.length, 7);
    return true;
  })));
});

test("diversified Dia de Sorte generation diversifies the shared core and keeps repeat limits", () => {
  const contests = diaContests();
  const lastContest = contests.at(-1)!;
  const replaySeed = "dia-replay";
  const first = generateDiaDeSorteGames(contests, {
    gameCount: 3,
    generationMode: "diversified",
    seed: replaySeed,
  });
  const replay = generateDiaDeSorteGames(contests, {
    gameCount: 3,
    generationMode: "diversified",
    seed: replaySeed,
  });
  const variants = SEEDS.map((seed) =>
    generateDiaDeSorteGames(contests, {
      gameCount: 3,
      generationMode: "diversified",
      seed: `dia-${seed}`,
    }),
  );

  assert.deepEqual(first, replay);
  assert.ok(new Set(variants.map(fingerprint)).size > 1);
  assert.ok(new Set(variants.map(coreFingerprint)).size > 1);
  assert.ok(variants.every(sharesOneCore));
  assert.ok(variants.every((games) => games.every((game) => {
    assert.equal(game.numbers.length, 7);
    assert.equal(game.fixedNumbers.length, 3);
    assert.equal(game.variableNumbers.length, 4);
    assert.ok(game.fixedNumbers.filter((number) => lastContest.numbers.includes(number)).length <= 1);
    return true;
  })));
});

test("deterministic mode remains the default and diversified mode requires a seed", () => {
  const contests = megaContests();
  assert.deepEqual(generateMegaSenaGames(contests, 2), generateMegaSenaGames(contests, 2));
  assert.throws(
    () => generateMegaSenaGames(contests, { gameCount: 2, generationMode: "diversified" }),
    /seed is required/i,
  );
});
