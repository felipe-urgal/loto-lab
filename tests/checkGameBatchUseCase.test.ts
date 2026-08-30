import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, LotteryId } from "../src/domain/types.js";
import {
  CheckGameBatchUseCase,
  type CheckableGameBatch,
  type ContestReader,
  type GeneratedBatchReader,
} from "../src/application/checkGameBatch.js";

const batch: CheckableGameBatch = {
  id: 7,
  lottery: "mega-sena",
  targetContestNumber: 100,
  generatorOptions: { generationMode: "deterministic" },
  createdAt: "2026-08-30T00:00:00.000Z",
  hasRealBet: false,
  games: [{
    lottery: "mega-sena",
    numbers: [1, 2, 3, 4, 5, 6],
    fixedNumbers: [1, 2, 3],
    variableNumbers: [4, 5, 6],
    metadata: {
      odd: 3,
      even: 3,
      sum: 21,
      repeatedFromLastContest: [],
    },
  }],
};

const target: Contest = {
  lottery: "mega-sena",
  number: 100,
  date: "2026-08-30",
  numbers: [1, 2, 3, 10, 11, 12],
};

function batchReader(value: CheckableGameBatch | undefined, requested: number[]): GeneratedBatchReader {
  return {
    async findBatch(id) {
      requested.push(id);
      return value;
    },
  };
}

function contestReader(
  value: Contest | undefined,
  requested: Array<{ lottery: LotteryId; contestNumber: number }>,
): ContestReader {
  return {
    async findByNumber(lottery, contestNumber) {
      requested.push({ lottery, contestNumber });
      return value;
    },
  };
}

test("CheckGameBatchUseCase evaluates a persisted batch without HTTP or PostgreSQL", async () => {
  const requestedBatches: number[] = [];
  const requestedContests: Array<{ lottery: LotteryId; contestNumber: number }> = [];
  const useCase = new CheckGameBatchUseCase(
    batchReader(batch, requestedBatches),
    contestReader(target, requestedContests),
  );

  const result = await useCase.execute(7, 100);

  assert.deepEqual(requestedBatches, [7]);
  assert.deepEqual(requestedContests, [{ lottery: "mega-sena", contestNumber: 100 }]);
  assert.ok(result);
  assert.deepEqual(result.batch, batch);
  assert.deepEqual(result.target, target);
  assert.equal(result.checks?.length, 1);
  assert.equal(result.checks?.[0]?.hits, 3);
  assert.deepEqual(result.checks?.[0]?.matchedNumbers, [1, 2, 3]);
  assert.equal(result.checks?.[0]?.fixedHits, 3);
  assert.equal(result.checks?.[0]?.variableHits, 0);
});

test("CheckGameBatchUseCase stops before contest lookup when the batch does not exist", async () => {
  const requestedBatches: number[] = [];
  const requestedContests: Array<{ lottery: LotteryId; contestNumber: number }> = [];
  const useCase = new CheckGameBatchUseCase(
    batchReader(undefined, requestedBatches),
    contestReader(target, requestedContests),
  );

  const result = await useCase.execute(404, 100);

  assert.equal(result, undefined);
  assert.deepEqual(requestedBatches, [404]);
  assert.deepEqual(requestedContests, []);
});

test("CheckGameBatchUseCase preserves the missing-contest result contract", async () => {
  const requestedBatches: number[] = [];
  const requestedContests: Array<{ lottery: LotteryId; contestNumber: number }> = [];
  const useCase = new CheckGameBatchUseCase(
    batchReader(batch, requestedBatches),
    contestReader(undefined, requestedContests),
  );

  const result = await useCase.execute(7, 101);

  assert.deepEqual(result, { batch, target: undefined, checks: undefined });
  assert.deepEqual(requestedContests, [{ lottery: "mega-sena", contestNumber: 101 }]);
});
