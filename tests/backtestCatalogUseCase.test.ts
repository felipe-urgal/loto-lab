import test from "node:test";
import assert from "node:assert/strict";
import {
  BacktestCatalogUseCase,
  type ApplicationBacktestRun,
  type ApplicationBacktestSummary,
  type BacktestCatalogStore,
} from "../src/application/backtestCatalog.js";

const run: ApplicationBacktestRun = {
  id: 7,
  lottery: "mega-sena",
  options: { gameCount: 2 },
  summary: { testedContests: 12 },
  rounds: [{ contest: 2801, bestHits: 4 }],
  createdAt: "2026-08-30T00:00:00.000Z",
};

const summary: ApplicationBacktestSummary = {
  id: run.id,
  lottery: run.lottery,
  options: run.options ?? {},
  summary: run.summary,
  roundCount: run.rounds.length,
  createdAt: run.createdAt,
};

test("BacktestCatalogUseCase resolves a run through its application port", async () => {
  const requestedIds: number[] = [];
  const store: BacktestCatalogStore = {
    async findById(id) {
      requestedIds.push(id);
      return id === run.id ? run : undefined;
    },
    async listRecentSummaries() {
      return [];
    },
  };
  const catalog = new BacktestCatalogUseCase(store);

  assert.equal(await catalog.get(999), undefined);
  assert.deepEqual(await catalog.get(run.id), run);
  assert.deepEqual(requestedIds, [999, run.id]);
});

test("BacktestCatalogUseCase forwards lottery and bounded limit without infrastructure knowledge", async () => {
  const calls: Array<{ lottery: string; limit?: number }> = [];
  const store: BacktestCatalogStore = {
    async findById() {
      return undefined;
    },
    async listRecentSummaries(lottery, limit) {
      calls.push({ lottery, ...(limit !== undefined ? { limit } : {}) });
      return [summary];
    },
  };
  const catalog = new BacktestCatalogUseCase(store);

  assert.deepEqual(await catalog.list("mega-sena", 25), [summary]);
  assert.deepEqual(calls, [{ lottery: "mega-sena", limit: 25 }]);
});
