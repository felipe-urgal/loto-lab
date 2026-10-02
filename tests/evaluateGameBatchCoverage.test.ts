import test from "node:test";
import assert from "node:assert/strict";
import { EvaluateGameBatchCoverageUseCase } from "../src/application/evaluateGameBatchCoverage.js";
import type { ApplicationGameBatch } from "../src/application/gameBatch.js";
import type { GeneratedGame } from "../src/domain/types.js";

function game(numbers: number[]): GeneratedGame {
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

const batch: ApplicationGameBatch = {
  id: 41,
  lottery: "mega-sena",
  generatorOptions: {
    purpose: "coverage",
    coverage: { algorithm: "greedy-set-cover-v1", coverageRatio: 0.75 },
  },
  createdAt: "2026-10-02T12:00:00.000Z",
  hasRealBet: false,
  games: [
    game([1, 2, 3, 4, 5, 6]),
    game([7, 8, 9, 10, 11, 12]),
  ],
};

test("coverage use case evaluates any persisted batch reproducibly", async () => {
  const useCase = new EvaluateGameBatchCoverageUseCase({
    findBatch: async (id) => id === batch.id ? batch : undefined,
  });

  const first = await useCase.execute({
    batchId: 41,
    seed: "batch-coverage",
    samples: 2_000,
  });
  const second = await useCase.execute({
    batchId: 41,
    seed: "batch-coverage",
    samples: 2_000,
  });

  assert.deepEqual(first, second);
  assert.equal(first?.batch.coveringDesign, true);
  assert.equal(first?.batch.generatorPurpose, "coverage");
  assert.equal(first?.target.scope.historicalDataUsed, false);
  assert.equal(first?.randomBaseline.gameCount, batch.games.length);
});

test("coverage use case returns undefined for a missing batch", async () => {
  const useCase = new EvaluateGameBatchCoverageUseCase({
    findBatch: async () => undefined,
  });

  assert.equal(await useCase.execute({ batchId: 404 }), undefined);
});
