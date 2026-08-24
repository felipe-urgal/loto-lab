import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, LotteryId } from "../src/domain/types.js";
import { generateMegaSenaGames } from "../src/generator/megaSena.js";
import { generateDiaDeSorteGames } from "../src/generator/diaDeSorte.js";
import { backtestRandomControl, sampleRandomControls } from "../src/lab/randomControl.js";
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
    numbers: Array.from({ length: drawSize }, (_, offset) => ((index * 3 + offset) % maxNumber) + 1).sort((a, b) => a - b),
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

test("random control is reproducible and can produce a distribution of controls", () => {
  const contests = contestsFor("lotofacil", 20, 15, 25);
  const options = {
    lottery: "lotofacil" as const,
    gameCount: 4,
    warmupContests: 5,
    startContest: 11,
    endContest: 20,
    seed: "test-seed",
  };

  const first = backtestRandomControl(contests, options);
  const second = backtestRandomControl(contests, options);
  assert.deepEqual(first, second);
  assert.equal(first.rounds.length, 10);
  assert.equal(first.summary.totalGames, 40);
  assert.ok(first.rounds.every((round) => round.checks.every((check) => check.fixedHits === 0)));

  const distribution = sampleRandomControls(contests, {
    lottery: "lotofacil",
    gameCount: 4,
    warmupContests: 5,
    startContest: 11,
    endContest: 20,
  }, 10, "distribution-test");
  assert.equal(distribution.length, 10);
  assert.equal(new Set(distribution.map((sample) => sample.seed)).size, 10);
  assert.ok(distribution.every((sample) => sample.summary.totalGames === 40));
});

test("strategy lab compares fixed-core presets and exposes a random distribution benchmark", () => {
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
      randomSamples: 10,
    });

    assert.deepEqual(result.variants.map((variant) => variant.fixedCount).sort((a, b) => a - b), fixture.expected);
    assert.equal(result.experiment, "fixed-core");
    assert.equal(result.variants.length, 3);
    assert.equal(result.startContest, 9);
    assert.equal(result.endContest, 18);
    assert.ok(result.winner);
    assert.ok(result.variants.every((variant) => variant.summary.testedContests === 10));
    assert.ok(result.variants.every((variant) => variant.series.length === 2));
    assert.equal(result.randomSamples, 10);
    assert.equal(result.benchmark.distribution.samples, 10);
    assert.ok(result.benchmark.distribution.p05 <= result.benchmark.distribution.p50);
    assert.ok(result.benchmark.distribution.p50 <= result.benchmark.distribution.p95);
    assert.ok(result.benchmark.strategyPercentile >= 0 && result.benchmark.strategyPercentile <= 1);
    assert.equal(result.benchmark.beatsRandom, result.benchmark.status === "beats-random");
    assert.equal(result.benchmark.controlKey, "random-control");
    assert.equal(result.benchmark.control.summary.testedContests, 10);
  }
});

test("strategy lab compares Score v2, Score v1 and no-score without leakage", () => {
  const contests = contestsFor("mega-sena", 24, 6, 60);
  const result = compareStrategyLab(contests, {
    lottery: "mega-sena",
    experiment: "score-model",
    gameCount: 1,
    warmupContests: 5,
    lookbackContests: 10,
    bucketSize: 5,
    randomSamples: 10,
  });

  const models = new Set(result.variants.map((variant) => variant.analysisModel));
  assert.equal(result.experiment, "score-model");
  assert.equal(result.variants.length, 3);
  assert.deepEqual(models, new Set(["score-v2", "score-v1", "no-score"]));
  assert.ok(result.variants.every((variant) => variant.fixedCount === 3));
  assert.ok(result.variants.every((variant) => variant.summary.testedContests === 10));
});

test("strategy lab exposes external Mega-Sena rules and a separate random benchmark", () => {
  const contests = contestsFor("mega-sena", 24, 6, 60);
  const result = compareStrategyLab(contests, {
    lottery: "mega-sena",
    experiment: "external-rules",
    gameCount: 1,
    warmupContests: 5,
    lookbackContests: 10,
    bucketSize: 5,
    randomSamples: 10,
  });

  const keys = new Set(result.variants.map((variant) => variant.key));
  assert.equal(result.experiment, "external-rules");
  assert.equal(result.variants.length, 9);
  assert.ok(keys.has("mega-rules-baseline"));
  assert.ok(keys.has("mega-rules-group-2"));
  assert.ok(keys.has("mega-rules-group-3"));
  assert.ok(keys.has("mega-rules-no-consecutive"));
  assert.ok(keys.has("mega-rules-columns"));
  assert.ok(keys.has("mega-rules-parity"));
  assert.ok(keys.has("mega-rules-quadrants"));
  assert.ok(keys.has("mega-rules-article-2"));
  assert.ok(keys.has("mega-rules-article-3"));
  assert.ok(result.variants.every((variant) => variant.fixedCount === 0));
  assert.ok(result.variants.every((variant) => variant.summary.testedContests === 10));
  assert.equal(result.benchmark.controlKey, "random-control");
  assert.equal(result.benchmark.distribution.samples, 10);
});
