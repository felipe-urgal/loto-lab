import test from "node:test";
import assert from "node:assert/strict";
import {
  benchmarkCoverage,
  simulateCoverage,
  simulateCoverageSpace,
} from "../src/analysis/coverageSimulator.js";
import type { GeneratedGame } from "../src/domain/types.js";

function megaGame(numbers: number[]): GeneratedGame {
  return {
    lottery: "mega-sena",
    numbers,
    fixedNumbers: [],
    variableNumbers: [...numbers],
    metadata: {
      odd: numbers.filter((value) => value % 2 !== 0).length,
      even: numbers.filter((value) => value % 2 === 0).length,
      sum: numbers.reduce((sum, value) => sum + value, 0),
      repeatedFromLastContest: [],
    },
  };
}

test("exact coverage on a small space has normalized probabilities", () => {
  const result = simulateCoverageSpace({
    universe: [1, 2, 3, 4, 5],
    drawSize: 2,
    games: [[1, 2], [3, 4]],
    exactDrawLimit: 100,
  });

  assert.equal(result.method, "exact");
  assert.equal(result.evaluatedDraws, 10);
  assert.equal(result.quality.exact, true);
  assert.equal(result.quality.sufficient, true);
  assert.equal(
    result.distribution.reduce((sum, entry) => sum + entry.probability, 0),
    1,
  );
  assert.equal(result.atLeast[0]?.probability, 1);
});

test("Monte Carlo is reproducible with the same seed", () => {
  const options = {
    universe: [1, 2, 3, 4, 5, 6, 7, 8],
    drawSize: 3,
    games: [[1, 2, 3], [4, 5, 6]],
    exactDrawLimit: 1,
    samples: 5_000,
    seed: "coverage-seed",
  };
  const first = simulateCoverageSpace(options);
  const second = simulateCoverageSpace(options);

  assert.equal(first.method, "monte-carlo");
  assert.deepEqual(first, second);
});

test("Monte Carlo converges near exact probabilities on a small characterization case", () => {
  const base = {
    universe: [1, 2, 3, 4, 5, 6],
    drawSize: 3,
    games: [[1, 2, 3], [4, 5, 6]],
  };
  const exact = simulateCoverageSpace({ ...base, exactDrawLimit: 100 });
  const monteCarlo = simulateCoverageSpace({
    ...base,
    exactDrawLimit: 1,
    samples: 50_000,
    seed: "convergence",
  });

  for (let hits = 0; hits <= base.drawSize; hits += 1) {
    assert.ok(
      Math.abs(
        (exact.atLeast[hits]?.probability ?? 0)
        - (monteCarlo.atLeast[hits]?.probability ?? 0),
      ) < 0.02,
    );
  }
});

test("zero games are valid and always produce zero best hits", () => {
  const result = simulateCoverageSpace({
    universe: [1, 2, 3, 4],
    drawSize: 2,
    games: [],
    exactDrawLimit: 100,
  });

  assert.equal(result.expectedBestHits, 0);
  assert.equal(result.distribution[0]?.probability, 1);
  assert.equal(result.atLeast[1]?.probability, 0);
});

test("duplicate games do not inflate coverage", () => {
  const one = simulateCoverageSpace({
    universe: [1, 2, 3, 4, 5],
    drawSize: 2,
    games: [[1, 2]],
    exactDrawLimit: 100,
  });
  const duplicated = simulateCoverageSpace({
    universe: [1, 2, 3, 4, 5],
    drawSize: 2,
    games: [[1, 2], [1, 2]],
    exactDrawLimit: 100,
  });

  assert.deepEqual(duplicated.distribution, one.distribution);
  assert.deepEqual(duplicated.atLeast, one.atLeast);
});

test("adding a game cannot reduce at-least hit coverage in exact evaluation", () => {
  const one = simulateCoverageSpace({
    universe: [1, 2, 3, 4, 5],
    drawSize: 2,
    games: [[1, 2]],
    exactDrawLimit: 100,
  });
  const two = simulateCoverageSpace({
    universe: [1, 2, 3, 4, 5],
    drawSize: 2,
    games: [[1, 2], [3, 4]],
    exactDrawLimit: 100,
  });

  for (let hits = 0; hits <= 2; hits += 1) {
    assert.ok((two.atLeast[hits]?.probability ?? 0) >= (one.atLeast[hits]?.probability ?? 0));
  }
});

test("invalid bets are rejected", () => {
  assert.throws(
    () => simulateCoverageSpace({
      universe: [1, 2, 3, 4],
      drawSize: 2,
      games: [[1, 1]],
    }),
    /invalid/,
  );
});

test("lottery simulation reports duplicate count separately and quality metadata", () => {
  const game = megaGame([1, 2, 3, 4, 5, 6]);
  const result = simulateCoverage({
    lottery: "mega-sena",
    games: [game, game],
    seed: "mega",
    samples: 2_000,
  });

  assert.equal(result.method, "monte-carlo");
  assert.equal(result.gameCount, 2);
  assert.equal(result.uniqueGameCount, 1);
  assert.equal(result.scope.historicalDataUsed, false);
  assert.equal(result.scope.synthetic, true);
  assert.equal(result.evaluatedDraws, 2_000);
  assert.ok(result.quality.resolution > 0);
  assert.ok(result.quality.maxMarginError95 > 0);
});

test("benchmark uses the same draw protocol and is reproducible", () => {
  const games = [
    megaGame([1, 2, 3, 4, 5, 6]),
    megaGame([7, 8, 9, 10, 11, 12]),
  ];
  const first = benchmarkCoverage({
    lottery: "mega-sena",
    games,
    seed: "benchmark",
    samples: 2_000,
  });
  const second = benchmarkCoverage({
    lottery: "mega-sena",
    games,
    seed: "benchmark",
    samples: 2_000,
  });

  assert.deepEqual(first, second);
  assert.equal(first.target.seed, first.randomBaseline.seed);
  assert.equal(first.target.evaluatedDraws, first.randomBaseline.evaluatedDraws);
  for (const entry of first.target.atLeast) {
    assert.ok(entry.probability >= 0 && entry.probability <= 1);
  }
});
