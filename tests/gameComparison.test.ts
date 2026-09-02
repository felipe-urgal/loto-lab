import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBatchComparison,
  buildComparisonAvailability,
  CompareGameBatchUseCase,
  ComparisonStartRequiredError,
} from "../src/application/compareGameBatch.js";
import type { ApplicationGameBatch } from "../src/application/gameBatch.js";
import type { ContestListQuery } from "../src/application/contestCatalog.js";

function batch(lottery: ApplicationGameBatch["lottery"], games: ApplicationGameBatch["games"]): ApplicationGameBatch {
  return {
    id: 77,
    lottery,
    targetContestNumber: 100,
    generatorOptions: {},
    createdAt: "2026-08-21T12:00:00.000Z",
    hasRealBet: false,
    games,
  };
}

test("batch comparison highlights matches and summarizes the best game per contest without financial fields", () => {
  const input = batch("mega-sena", [
    {
      lottery: "mega-sena",
      numbers: [1, 2, 3, 4, 5, 6],
      fixedNumbers: [1, 2, 3],
      variableNumbers: [4, 5, 6],
      metadata: { odd: 3, even: 3, sum: 21, repeatedFromLastContest: [] },
    },
    {
      lottery: "mega-sena",
      numbers: [1, 10, 20, 30, 40, 50],
      fixedNumbers: [1, 10, 20],
      variableNumbers: [30, 40, 50],
      metadata: { odd: 1, even: 5, sum: 151, repeatedFromLastContest: [] },
    },
  ]);

  const result = buildBatchComparison(input, [
    { number: 100, date: "2026-08-20", numbers: [1, 2, 8, 9, 10, 11] },
    { number: 101, date: "2026-08-21", numbers: [1, 2, 3, 4, 40, 60] },
  ]);

  assert.equal(result.summary.contestCount, 2);
  assert.equal(result.summary.bestHits, 4);
  assert.equal(result.summary.bestContestNumber, 101);
  assert.equal(result.summary.averageBestHits, 3);
  assert.deepEqual(result.items[0]!.matchedAnyNumbers, [1, 2, 10]);
  assert.deepEqual(result.items[1]!.games[0]!.matchedNumbers, [1, 2, 3, 4]);
  assert.deepEqual(result.items[1]!.games[0]!.fixedMatchedNumbers, [1, 2, 3]);

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("ticketCost"), false);
  assert.equal(serialized.includes("totalPrizeValue"), false);
  assert.equal(serialized.includes("netResult"), false);
});

test("empty comparison remains a valid result while contest history is unavailable", () => {
  const input = batch("lotofacil", [{
    lottery: "lotofacil",
    numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    fixedNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
    variableNumbers: [9, 10, 11, 12, 13, 14, 15],
    metadata: { odd: 8, even: 7, sum: 120, repeatedFromLastContest: [] },
  }]);

  const result = buildBatchComparison(input, []);

  assert.deepEqual(result.items, []);
  assert.equal(result.summary.contestCount, 0);
  assert.equal(result.summary.bestHits, 0);
  assert.equal(result.summary.averageBestHits, 0);
  assert.equal(result.summary.bestContestNumber, undefined);
  assert.equal(result.drawSize, 15);
});

test("comparison availability is pending when the requested contest is not synchronized", () => {
  const availability = buildComparisonAvailability(3768, [], 3767);

  assert.deepEqual(availability, {
    status: "pending",
    targetContestNumber: 3768,
    lastAvailableContestNumber: 3767,
  });
});

test("comparison availability uses the last selected contest when history is available", () => {
  const availability = buildComparisonAvailability(3760, [{ number: 3760 }, { number: 3761 }, { number: 3762 }], 3759);

  assert.deepEqual(availability, {
    status: "available",
    targetContestNumber: 3760,
    lastAvailableContestNumber: 3762,
  });
});

test("historical comparison is allowed before the batch target", () => {
  const input = batch("lotofacil", [{
    lottery: "lotofacil",
    numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    fixedNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
    variableNumbers: [9, 10, 11, 12, 13, 14, 15],
    metadata: { odd: 8, even: 7, sum: 120, repeatedFromLastContest: [] },
  }]);

  const result = buildBatchComparison(input, [{
    number: 99,
    date: "2026-08-20",
    numbers: [1, 2, 3, 4, 5, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
  }]);

  assert.equal(result.items[0]!.contestNumber, 99);
  assert.equal(result.items[0]!.games[0]!.hits, 5);
});

test("Lotofacil comparison preserves the 15-number game denominator and exact matches", () => {
  const input = batch("lotofacil", [{
    lottery: "lotofacil",
    numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    fixedNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
    variableNumbers: [9, 10, 11, 12, 13, 14, 15],
    metadata: { odd: 8, even: 7, sum: 120, repeatedFromLastContest: [] },
  }]);

  const result = buildBatchComparison(input, [{
    number: 100,
    date: "2026-08-21",
    numbers: [1, 2, 3, 4, 5, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
  }]);

  assert.equal(result.drawSize, 15);
  assert.equal(result.items[0]!.games[0]!.hits, 5);
  assert.deepEqual(result.items[0]!.games[0]!.matchedNumbers, [1, 2, 3, 4, 5]);
  assert.equal(result.summary.bestHits, 5);
});

test("Dia de Sorte comparison keeps lucky-month hits separate from number hits", () => {
  const input = batch("dia-de-sorte", [{
    lottery: "dia-de-sorte",
    numbers: [1, 2, 3, 4, 5, 6, 7],
    fixedNumbers: [1, 2, 3],
    variableNumbers: [4, 5, 6, 7],
    luckyMonth: "Agosto",
    metadata: { odd: 4, even: 3, sum: 28, repeatedFromLastContest: [] },
  }]);

  const result = buildBatchComparison(input, [{
    number: 100,
    date: "2026-08-21",
    numbers: [1, 8, 9, 10, 11, 12, 13],
    luckyMonth: "Agosto",
  }]);

  assert.equal(result.items[0]!.games[0]!.hits, 1);
  assert.equal(result.items[0]!.games[0]!.luckyMonthHit, true);
  assert.equal(result.summary.bestHits, 1);
});

test("comparison use case starts at the target contest and preserves the non-financial scope", async () => {
  const input = batch("mega-sena", [{
    lottery: "mega-sena",
    numbers: [1, 2, 3, 4, 5, 6],
    fixedNumbers: [1, 2, 3],
    variableNumbers: [4, 5, 6],
    metadata: { odd: 3, even: 3, sum: 21, repeatedFromLastContest: [] },
  }]);
  const queries: ContestListQuery[] = [];
  const useCase = new CompareGameBatchUseCase(
    { findBatch: async () => input },
    {
      list: async (query) => {
        queries.push(query);
        return [{
          lottery: "mega-sena",
          number: 100,
          date: "2026-08-21",
          numbers: [1, 2, 8, 9, 10, 11],
        }];
      },
    },
  );

  const result = await useCase.execute({ batchId: 77, count: 5 });

  assert.deepEqual(queries, [{ lottery: "mega-sena", startContest: 100, order: "asc", limit: 5 }]);
  assert.equal(result?.startContestNumber, 100);
  assert.equal(result?.requestedCount, 5);
  assert.deepEqual(result?.availability, {
    status: "available",
    targetContestNumber: 100,
    lastAvailableContestNumber: 100,
  });
  assert.deepEqual(result?.scope, {
    kind: "post-target",
    minimumContestNumber: 100,
    financial: false,
    note: "Comparação dos jogos a partir do concurso-alvo; nenhum valor financeiro é registrado.",
  });
});

test("comparison use case reports the last synchronized contest when the requested range is pending", async () => {
  const input = batch("mega-sena", [{
    lottery: "mega-sena",
    numbers: [1, 2, 3, 4, 5, 6],
    fixedNumbers: [1, 2, 3],
    variableNumbers: [4, 5, 6],
    metadata: { odd: 3, even: 3, sum: 21, repeatedFromLastContest: [] },
  }]);
  const queries: ContestListQuery[] = [];
  const useCase = new CompareGameBatchUseCase(
    { findBatch: async () => input },
    {
      list: async (query) => {
        queries.push(query);
        if (query.startContest !== undefined) return [];
        return [{
          lottery: "mega-sena",
          number: 99,
          date: "2026-08-20",
          numbers: [7, 8, 9, 10, 11, 12],
        }];
      },
    },
  );

  const result = await useCase.execute({ batchId: 77, count: 5 });

  assert.deepEqual(queries, [
    { lottery: "mega-sena", startContest: 100, order: "asc", limit: 5 },
    { lottery: "mega-sena", endContest: 99, order: "desc", limit: 1 },
  ]);
  assert.deepEqual(result?.availability, {
    status: "pending",
    targetContestNumber: 100,
    lastAvailableContestNumber: 99,
  });
});

test("comparison use case requires an explicit starting contest for legacy batches without a target", async () => {
  const input = batch("mega-sena", []);
  delete input.targetContestNumber;
  const useCase = new CompareGameBatchUseCase(
    { findBatch: async () => input },
    { list: async () => [] },
  );

  await assert.rejects(
    () => useCase.execute({ batchId: 77, count: 5 }),
    ComparisonStartRequiredError,
  );
});

test("comparison use case supports an explicit exploratory start for legacy batches", async () => {
  const input = batch("mega-sena", []);
  delete input.targetContestNumber;
  const useCase = new CompareGameBatchUseCase(
    { findBatch: async () => input },
    { list: async () => [] },
  );

  const result = await useCase.execute({ batchId: 77, count: 5, startContest: 42 });

  assert.equal(result?.startContestNumber, 42);
  assert.deepEqual(result?.scope, {
    kind: "post-target",
    financial: false,
    note: "Comparação exploratória a partir do concurso escolhido; nenhum valor financeiro é registrado.",
  });
});

test("comparison use case returns undefined when the batch does not exist", async () => {
  const useCase = new CompareGameBatchUseCase(
    { findBatch: async () => undefined },
    { list: async () => assert.fail("contest history should not be read for a missing batch") },
  );

  assert.equal(await useCase.execute({ batchId: 999, count: 5 }), undefined);
});
