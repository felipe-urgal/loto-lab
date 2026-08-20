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

test("diversified Mega-Sena generation is reproducible by seed and varies across seeds", () => {
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
  const variants = ["mega-seed-a", "mega-seed-b", "mega-seed-c", "mega-seed-d"].map((seed) =>
    generateMegaSenaGames(contests, { gameCount: 3, generationMode: "diversified", seed }),
  );

  assert.deepEqual(first, replay);
  assert.ok(new Set(variants.map(fingerprint)).size > 1);
  assert.ok(variants.every((games) =>
    games.every((game) => JSON.stringify(game.fixedNumbers) === JSON.stringify(first[0]!.fixedNumbers)),
  ));
});

test("diversified Lotofacil generation varies variables while preserving the fixed core", () => {
  const contests = lotofacilContests();
  const variants = ["loto-a", "loto-b", "loto-c", "loto-d"].map((seed) =>
    generateLotofacilGames(contests, {
      gameCount: 2,
      fixedCount: 8,
      generationMode: "diversified",
      seed,
    }),
  );

  assert.ok(new Set(variants.map(fingerprint)).size > 1);
  const core = variants[0]![0]!.fixedNumbers;
  assert.ok(variants.every((games) => games.every((game) => {
    assert.equal(game.numbers.length, 15);
    assert.equal(game.variableNumbers.length, 7);
    return JSON.stringify(game.fixedNumbers) === JSON.stringify(core);
  })));
});

test("diversified Dia de Sorte generation varies variables while preserving the fixed core", () => {
  const contests = diaContests();
  const variants = ["dia-a", "dia-b", "dia-c", "dia-d"].map((seed) =>
    generateDiaDeSorteGames(contests, {
      gameCount: 3,
      generationMode: "diversified",
      seed,
    }),
  );

  assert.ok(new Set(variants.map(fingerprint)).size > 1);
  const core = variants[0]![0]!.fixedNumbers;
  assert.ok(variants.every((games) => games.every((game) => {
    assert.equal(game.numbers.length, 7);
    assert.equal(game.variableNumbers.length, 4);
    return JSON.stringify(game.fixedNumbers) === JSON.stringify(core);
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
