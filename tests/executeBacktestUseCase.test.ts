import test from "node:test";
import assert from "node:assert/strict";
import {
  BacktestExecutionBusyError,
  ExecuteBacktestUseCase,
  type BacktestExecutionGate,
} from "../src/application/executeBacktest.js";
import type { RunBacktestRequest, RunBacktestResponse } from "../src/application/runBacktest.js";

const input: RunBacktestRequest = {
  lottery: "mega-sena",
  gameCount: 2,
  warmupContests: 20,
  persist: false,
};

function gate(acquire: BacktestExecutionGate["acquire"]): BacktestExecutionGate {
  return { acquire };
}

test("ExecuteBacktestUseCase rejects a busy gate without starting the executor", async () => {
  let executions = 0;
  const useCase = new ExecuteBacktestUseCase(
    gate(() => undefined),
    async () => {
      executions += 1;
      return {} as RunBacktestResponse;
    },
  );

  await assert.rejects(
    () => useCase.execute(input),
    (error: unknown) => {
      assert.ok(error instanceof BacktestExecutionBusyError);
      assert.equal(error.code, "ANALYSIS_BUSY");
      return true;
    },
  );
  assert.equal(executions, 0);
});

test("ExecuteBacktestUseCase forwards input and signal and releases the gate on success", async () => {
  let releases = 0;
  const controller = new AbortController();
  const expected: RunBacktestResponse = {
    lottery: "mega-sena",
    options: {},
    summary: {},
    roundCount: 3,
  };
  const useCase = new ExecuteBacktestUseCase(
    gate(() => () => {
      releases += 1;
    }),
    async (receivedInput, signal) => {
      assert.equal(receivedInput, input);
      assert.equal(signal, controller.signal);
      return expected;
    },
  );

  assert.equal(await useCase.execute(input, controller.signal), expected);
  assert.equal(releases, 1);
});

test("ExecuteBacktestUseCase releases the expensive-work gate when execution fails", async () => {
  let releases = 0;
  const useCase = new ExecuteBacktestUseCase(
    gate(() => () => {
      releases += 1;
    }),
    async () => {
      throw new Error("worker failed");
    },
  );

  await assert.rejects(() => useCase.execute(input), /worker failed/);
  assert.equal(releases, 1);
});
