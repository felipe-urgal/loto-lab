import assert from "node:assert/strict";
import test from "node:test";
import {
  AnalysisJobNotFoundError,
  AnalysisJobStrategyLotteryMismatchError,
  AnalysisJobStrategyVersionNotFoundError,
  AnalysisJobsUseCase,
  type AnalysisJobQueue,
  type ApplicationAnalysisJobRecord,
} from "../src/application/analysisJobs.js";
import type { Contest } from "../src/domain/types.js";

function job(input: Record<string, unknown>): ApplicationAnalysisJobRecord {
  return {
    id: 1,
    kind: "backtest",
    lottery: "mega-sena",
    status: "queued",
    input,
    cancelRequested: false,
    createdAt: "2026-09-02T00:00:00.000Z",
  };
}

function contests(count = 26): Contest[] {
  return Array.from({ length: count }, (_, index) => ({
    lottery: "mega-sena" as const,
    number: index + 1,
    date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
    numbers: [1, 2, 3, 4, 5, 6],
  }));
}

test("AnalysisJobsUseCase merges strategy config, validates history and enqueues a backtest", async () => {
  const enqueued: Array<{ kind: string; lottery: string; input: Record<string, unknown> }> = [];
  const queue: AnalysisJobQueue = {
    enqueue: async (kind, lottery, input) => {
      enqueued.push({ kind, lottery, input });
      return job(input);
    },
    list: async () => [],
    findById: async () => undefined,
    cancel: async () => undefined,
  };
  const useCase = new AnalysisJobsUseCase(
    queue,
    {
      findVersionById: async (id) => id === 10
        ? {
            id: 10,
            strategyId: 7,
            config: {
              gameCount: 1,
              warmupContests: 20,
              startContest: 21,
              endContest: 21,
            },
          }
        : undefined,
      findById: async (id) => id === 7 ? { id: 7, lottery: "mega-sena" } : undefined,
    },
    { list: async () => contests() },
  );

  const created = await useCase.enqueue({
    kind: "backtest",
    lottery: "mega-sena",
    values: { strategyVersionId: 10, gameCount: 2 },
  });

  assert.equal(created.status, "queued");
  assert.deepEqual(enqueued, [{
    kind: "backtest",
    lottery: "mega-sena",
    input: {
      lottery: "mega-sena",
      gameCount: 2,
      warmupContests: 20,
      persist: true,
      eligibleRounds: 1,
      startContest: 21,
      endContest: 21,
      strategyId: 7,
      strategyVersionId: 10,
    },
  }]);
});

test("AnalysisJobsUseCase rejects missing and cross-lottery strategy versions before enqueue", async () => {
  let enqueueCalls = 0;
  const queue: AnalysisJobQueue = {
    enqueue: async (_kind, _lottery, input) => {
      enqueueCalls += 1;
      return job(input);
    },
    list: async () => [],
    findById: async () => undefined,
    cancel: async () => undefined,
  };
  const useCase = new AnalysisJobsUseCase(
    queue,
    {
      findVersionById: async (id) => id === 20 ? { id: 20, strategyId: 8, config: {} } : undefined,
      findById: async (id) => id === 8 ? { id: 8, lottery: "lotofacil" } : undefined,
    },
    { list: async () => contests() },
  );

  await assert.rejects(
    () => useCase.enqueue({
      kind: "backtest",
      lottery: "mega-sena",
      values: { strategyVersionId: 999 },
    }),
    AnalysisJobStrategyVersionNotFoundError,
  );
  await assert.rejects(
    () => useCase.enqueue({
      kind: "backtest",
      lottery: "mega-sena",
      values: { strategyVersionId: 20 },
    }),
    AnalysisJobStrategyLotteryMismatchError,
  );
  assert.equal(enqueueCalls, 0);
});

test("AnalysisJobsUseCase delegates list/find/cancel and exposes a stable not-found error", async () => {
  const existing = job({ lottery: "mega-sena" });
  const calls: string[] = [];
  const useCase = new AnalysisJobsUseCase(
    {
      enqueue: async () => existing,
      list: async (limit, lottery) => {
        calls.push(`list:${limit}:${lottery ?? "all"}`);
        return [existing];
      },
      findById: async (id) => {
        calls.push(`find:${id}`);
        return id === 1 ? existing : undefined;
      },
      cancel: async (id) => {
        calls.push(`cancel:${id}`);
        return id === 1 ? { ...existing, status: "cancelled", cancelRequested: true } : undefined;
      },
    },
    {
      findVersionById: async () => undefined,
      findById: async () => undefined,
    },
    { list: async () => [] },
  );

  assert.equal((await useCase.list(10, "mega-sena")).length, 1);
  assert.equal((await useCase.findById(1)).id, 1);
  assert.equal((await useCase.cancel(1)).status, "cancelled");
  await assert.rejects(() => useCase.findById(2), AnalysisJobNotFoundError);
  await assert.rejects(() => useCase.cancel(2), AnalysisJobNotFoundError);
  assert.deepEqual(calls, ["list:10:mega-sena", "find:1", "cancel:1", "find:2", "cancel:2"]);
});
