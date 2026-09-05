import test from "node:test";
import assert from "node:assert/strict";
import {
  OperationAlreadyRunningError,
  OperationsUseCase,
  type OperationRunSnapshot,
} from "../src/application/operations.js";

function history(latest?: OperationRunSnapshot<unknown>) {
  return {
    async latest<TDetails>() {
      return latest as OperationRunSnapshot<TDetails> | undefined;
    },
  };
}

test("OperationsUseCase reports a fresh successful operation from an application port", async () => {
  const now = Date.parse("2026-08-30T12:00:00.000Z");
  const latest: OperationRunSnapshot = {
    id: 7,
    operation: "sync-all",
    status: "success",
    details: { successfulLotteries: 3 },
    startedAt: "2026-08-30T11:20:00.000Z",
    finishedAt: "2026-08-30T11:30:00.000Z",
  };
  const useCase = new OperationsUseCase(history(latest), async () => latest, () => now);

  assert.deepEqual(await useCase.status({
    autoSyncEnabled: true,
    intervalMinutes: 30,
    staleAfterMinutes: 180,
  }), {
    autoSyncEnabled: true,
    intervalMinutes: 30,
    staleAfterMinutes: 180,
    stale: false,
    ageMinutes: 30,
    latest,
    sync: {
      status: "success",
      partial: false,
      running: false,
      durationMs: 600_000,
    },
  });
});

test("OperationsUseCase marks missing, failed and old runs as stale", async () => {
  const now = Date.parse("2026-08-30T12:00:00.000Z");
  const config = {
    autoSyncEnabled: false,
    intervalMinutes: 45,
    staleAfterMinutes: 60,
  };

  const missing = new OperationsUseCase(history(), async () => {
    throw new Error("not used");
  }, () => now);
  const missingStatus = await missing.status(config);
  assert.equal(missingStatus.stale, true);
  assert.deepEqual(missingStatus.sync, {
    status: "unknown",
    partial: false,
    running: false,
  });

  const failedRun: OperationRunSnapshot = {
    id: 8,
    operation: "sync-all",
    status: "failed",
    details: {},
    startedAt: "2026-08-30T11:50:00.000Z",
  };
  const failed = new OperationsUseCase(history(failedRun), async () => failedRun, () => now);
  const failedStatus = await failed.status(config);
  assert.equal(failedStatus.stale, true);
  assert.equal(failedStatus.ageMinutes, 10);
  assert.equal(failedStatus.sync.status, "failed");

  const oldRun: OperationRunSnapshot = {
    ...failedRun,
    id: 9,
    status: "success",
    startedAt: "2026-08-30T09:00:00.000Z",
  };
  const old = new OperationsUseCase(history(oldRun), async () => oldRun, () => now);
  assert.equal((await old.status(config)).stale, true);
});

test("OperationsUseCase exposes partial and running sync states without inventing duration", async () => {
  const now = Date.parse("2026-08-30T12:00:00.000Z");
  const config = {
    autoSyncEnabled: true,
    intervalMinutes: 30,
    staleAfterMinutes: 180,
  };
  const partialRun: OperationRunSnapshot = {
    id: 10,
    operation: "sync-all",
    status: "partial",
    details: { successfulLotteries: 2 },
    startedAt: "2026-08-30T11:00:00.000Z",
    finishedAt: "2026-08-30T11:02:30.000Z",
  };
  const partial = new OperationsUseCase(history(partialRun), async () => partialRun, () => now);
  assert.deepEqual((await partial.status(config)).sync, {
    status: "partial",
    partial: true,
    running: false,
    durationMs: 150_000,
  });

  const runningRun: OperationRunSnapshot = {
    id: 11,
    operation: "sync-all",
    status: "running",
    details: {},
    startedAt: "2026-08-30T11:59:00.000Z",
  };
  const running = new OperationsUseCase(history(runningRun), async () => runningRun, () => now);
  assert.deepEqual((await running.status(config)).sync, {
    status: "running",
    partial: false,
    running: true,
  });
});

test("OperationsUseCase delegates synchronization and preserves the application error contract", async () => {
  const completed: OperationRunSnapshot = {
    id: 12,
    operation: "sync-all",
    status: "success",
    details: { successfulLotteries: 3 },
    startedAt: "2026-08-30T12:00:00.000Z",
    finishedAt: "2026-08-30T12:01:00.000Z",
  };
  let runs = 0;
  const useCase = new OperationsUseCase(history(completed), async () => {
    runs += 1;
    return completed;
  });

  assert.equal(await useCase.sync(), completed);
  assert.equal(runs, 1);

  const busy = new OperationAlreadyRunningError();
  assert.equal(busy.code, "OPERATION_ALREADY_RUNNING");
  assert.equal(busy.message, "An operational synchronization is already running");
});
