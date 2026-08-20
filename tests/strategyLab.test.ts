import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, LotteryId } from "../src/domain/types.js";
import { generateMegaSenaGames } from "../src/generator/megaSena.js";
import { generateDiaDeSorteGames } from "../src/generator/diaDeSorte.js";
import { compareStrategyLab } from "../src/lab/strategyLab.js";

function contestsFor(
  lottery: LotteryId,
  count: number,
  drawSize: number,
  maxNumber: number,
): Contest[] {
  return Array.from({ length: count }, (_, index) => ({
    lottery,
    number: index + 1,
    date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
    numbers: Array.from(
      { length: drawSize },
      (_, offset) => ((index * 3 + offset) % maxNumber) + 1,
    ).sort((a, b) => a - b),
    ...(lottery === "dia-de-sorte" ? { luckyMonth: "Janeiro" } : {}),
  }));
}

test("Mega-Sena and Dia de Sorte generators support experimental fixed-core sizes", () => {
  const megaHistory = contestsFor("mega-sena", 20, 6, 60);
  const megaNoCore = generateMegaSenaGames(megaHistory, { gameCount: 2, fixedCount: 0 });
  const megaTwo = generateMegaSenaGames(megaHistory, { gameCount: 2, fixedCount: 2 });
  const megaThree = generateMegaSenaGames(megaHistory, { gameCount: 2, fixedCount: 3 });

  assert.ok(megaNoCore.every((game) => game.fixedNumbers.length === 0 && game.variableNumbers.length === 6));
  assert.ok(megaTwo.every((game) => game.fixedNumbers.length === 2 && game.variableNumbers.length === 4));
  assert.ok(megaThree.every((game) => game.fixedNumbers.length === 3 && game.variableNumbers.length === 3));

  const diaHistory = contestsFor("dia-de-sorte", 20, 7, 31);
  const diaNoCore = generateDiaDeSorteGames(diaHistory, { gameCount: 2, fixedCount: 0 });
  const diaTwo = generateDiaDeSorteGames(diaHistory, { gameCount: 2, fixedCount: 2 });
  const diaThree = generateDiaDeSorteGames(diaHistory, { gameCount: 2, fixedCount: 3 });

  assert.ok(diaNoCore.every((game) => game.fixedNumbers.length === 0 && game.variableNumbers.length === 7));
  assert.ok(diaTwo.every((game) => game.fixedNumbers.length === 2 && game.variableNumbers.length === 5));
  assert.ok(diaThree.every((game) => game.fixedNumbers.length === 3 && game.variableNumbers.length === 4));
});

test("strategy lab compares the expected presets over the same period", () => {
  const fixtures = [
    { lottery: "mega-sena" as const, drawSize: 6, maxNumber: 60, expected: [0, 2, 3] },
    { lottery: "lotofacil" as const, drawSize: 15, maxNumber: 25, expected: [8, 9, 10] },
    { lottery: "dia-de-sorte" as const, drawSize: 7, maxNumber: 31, expected: [0, 2, 3] },
  ];

  for (const fixture of fixtures) {
    const contests = contestsFor(fixture.lottery, 18, fixture.drawSize, fixture.maxNumber);
    const result = compareStrategyLab(contests, {
      lottery: fixture.lottery,
      gameCount: 1,
      warmupContests: 5,
      lookbackContests: 10,
      bucketSize: 5,
    });

    assert.deepEqual(
      result.variants.map((variant) => variant.fixedCount).sort((a, b) => a - b),
      fixture.expected,
    );
    assert.equal(result.startContest, 9);
    assert.equal(result.endContest, 18);
    assert.ok(result.winner);
    assert.ok(result.variants.every((variant) => variant.summary.testedContests === 10));
    assert.ok(result.variants.every((variant) => variant.series.length === 2));
  }
});
