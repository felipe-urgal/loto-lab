import test from "node:test";
import assert from "node:assert/strict";
import type { Contest } from "../src/domain/types.js";
import type { StrategyLabResult } from "../src/lab/strategyLab.js";
import {
  EmptyStrategyLabPeriodError,
  InsufficientStrategyLabHistoryError,
  RunStrategyLabUseCase,
  StrategyLabBusyError,
  StrategyLabTooLargeError,
  estimateStrategyLabWorkUnits,
  type StrategyLabRunRequest,
  type StrategyLabWorkGate,
} from "../src/application/runStrategyLab.js";

function makeHistory(count: number): Contest[] {
  return Array.from({ length: count }, (_, index) => ({
    lottery: "mega-sena" as const,
    number: 2600 + index,
    date: `2026-${String((Math.floor(index / 28) % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
    numbers: Array.from({ length: 6 }, (_, offset) => ((index * 5 + offset * 7) % 60) + 1)
      .sort((a, b) => a - b),
  }));
}

function input(overrides: Partial<StrategyLabRunRequest> = {}): StrategyLabRunRequest {
  return {
    lottery: "mega-sena",
    experiment: "fixed-core",
    gameCount: 1,
    warmupContests: 20,
    lookbackContests: 10,
    bucketSize: 5,
    randomSamples: 10,
    ...overrides,
  };
}

function gate(acquire: StrategyLabWorkGate["acquire"]): StrategyLabWorkGate {
  return { acquire };
}

test("RunStrategyLabUseCase rejects insufficient history before acquiring expensive work", async () => {
  let gateCalls = 0;
  let executions = 0;
  const useCase = new RunStrategyLabUseCase(
    { async list() { return makeHistory(20); } },
    gate(() => {
      gateCalls += 1;
      return () => undefined;
    }),
    async () => {
      executions += 1;
      return {} as StrategyLabResult;
    },
  );

  await assert.rejects(
    () => useCase.execute(input()),
    (error: unknown) => {
      assert.ok(error instanceof InsufficientStrategyLabHistoryError);
      assert.equal(error.required, 21);
      assert.equal(error.code, "INSUFFICIENT_HISTORY");
      return true;
    },
  );
  assert.equal(gateCalls, 0);
  assert.equal(executions, 0);
});

test("RunStrategyLabUseCase rejects an empty explicit period before acquiring the gate", async () => {
  const useCase = new RunStrategyLabUseCase(
    { async list() { return makeHistory(30); } },
    gate(() => () => undefined),
    async () => ({} as StrategyLabResult),
  );

  await assert.rejects(
    () => useCase.execute(input({ startContest: 9999, endContest: 10000 })),
    (error: unknown) => {
      assert.ok(error instanceof EmptyStrategyLabPeriodError);
      assert.equal(error.code, "EMPTY_PERIOD");
      return true;
    },
  );
});

test("RunStrategyLabUseCase rejects oversized work before acquiring the gate", async () => {
  let gateCalls = 0;
  const useCase = new RunStrategyLabUseCase(
    { async list() { return makeHistory(520); } },
    gate(() => {
      gateCalls += 1;
      return () => undefined;
    }),
    async () => ({} as StrategyLabResult),
  );

  await assert.rejects(
    () => useCase.execute(input({
      experiment: "external-rules",
      gameCount: 10,
      lookbackContests: 500,
      randomSamples: 500,
    })),
    (error: unknown) => {
      assert.ok(error instanceof StrategyLabTooLargeError);
      assert.ok(error.estimatedWorkUnits > error.maximum);
      assert.equal(error.code, "ANALYSIS_TOO_LARGE");
      return true;
    },
  );
  assert.equal(gateCalls, 0);
});

test("RunStrategyLabUseCase rejects a busy gate without starting the executor", async () => {
  let executions = 0;
  const useCase = new RunStrategyLabUseCase(
    { async list() { return makeHistory(30); } },
    gate(() => undefined),
    async () => {
      executions += 1;
      return {} as StrategyLabResult;
    },
  );

  await assert.rejects(
    () => useCase.execute(input()),
    (error: unknown) => {
      assert.ok(error instanceof StrategyLabBusyError);
      assert.equal(error.code, "ANALYSIS_BUSY");
      return true;
    },
  );
  assert.equal(executions, 0);
});

test("RunStrategyLabUseCase forwards the snapshot and signal and releases the gate on success", async () => {
  let releases = 0;
  const controller = new AbortController();
  const expected = { winner: "fixed-3" } as unknown as StrategyLabResult;
  const useCase = new RunStrategyLabUseCase(
    { async list(options) {
      assert.deepEqual(options, { lottery: "mega-sena", order: "asc" });
      return makeHistory(30);
    } },
    gate(() => () => {
      releases += 1;
    }),
    async (contests, receivedInput, signal) => {
      assert.equal(contests.length, 30);
      assert.equal(receivedInput.experiment, "fixed-core");
      assert.equal(signal, controller.signal);
      return expected;
    },
  );

  assert.equal(await useCase.execute(input(), controller.signal), expected);
  assert.equal(releases, 1);
});

test("RunStrategyLabUseCase always releases the expensive-work gate when execution fails", async () => {
  let releases = 0;
  const useCase = new RunStrategyLabUseCase(
    { async list() { return makeHistory(30); } },
    gate(() => () => {
      releases += 1;
    }),
    async () => {
      throw new Error("worker failed");
    },
  );

  await assert.rejects(() => useCase.execute(input()), /worker failed/);
  assert.equal(releases, 1);
});

test("Strategy Lab work estimation preserves experiment-specific cost", () => {
  assert.equal(estimateStrategyLabWorkUnits("fixed-core", 10, 2, 100), 2_100);
  assert.equal(estimateStrategyLabWorkUnits("external-rules", 10, 2, 100), 2_220);
  assert.equal(estimateStrategyLabWorkUnits("score-model", 10, 2, 100), 2_500);
});
