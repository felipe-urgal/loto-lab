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
  assert.equal((await missing.status(config)).stale, true);

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

  const oldRun: OperationRunSnapshot = {
    ...failedRun,
    id: 9,
    status: "success",
    startedAt: "2026-08-30T09:00:00.000Z",
  };
  const old = new OperationsUseCase(history(oldRun), async () => oldRun, () => now);
  assert.equal((await old.status(config)).stale, true);
});

test("OperationsUseCase delegates synchronization and preserves the application error contract", async () => {
  const completed: OperationRunSnapshot = {
    id: 10,
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
