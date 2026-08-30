import test from "node:test";
import assert from "node:assert/strict";
import {
  RealBetUseCase,
  RealBetUseCaseError,
  type CreateRealBetRequest,
  type RealBetOperations,
  type RealBetRevisionReader,
  type RealBetSnapshot,
} from "../src/application/realBets.js";

function snapshot(overrides: Partial<RealBetSnapshot> = {}): RealBetSnapshot {
  return {
    id: 7,
    lottery: "mega-sena",
    contestNumber: 3000,
    status: "checked",
    ...overrides,
  };
}

function operations(overrides: Partial<RealBetOperations> = {}): RealBetOperations {
  return {
    async create(input) { return input; },
    async reconcilePending() { return 0; },
    async reconcile() { return snapshot(); },
    async list() { return { items: [], summary: {} }; },
    ...overrides,
  };
}

function revisions(overrides: Partial<RealBetRevisionReader> = {}): RealBetRevisionReader {
  return {
    async findById() { return snapshot(); },
    async listFinancialRevisions() { return []; },
    ...overrides,
  };
}

async function assertUseCaseError(
  action: () => Promise<unknown>,
  code: RealBetUseCaseError["code"],
  message: RegExp,
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof RealBetUseCaseError);
    assert.equal(error.code, code);
    assert.match(error.message, message);
    return true;
  });
}

test("RealBetUseCase translates legacy creation failures into stable application errors", async () => {
  const input: CreateRealBetRequest = { batchId: 42, actualCost: 12 };
  const cases = [
    {
      legacy: "BATCH_NOT_FOUND:42",
      code: "BATCH_NOT_FOUND" as const,
      message: /Game batch 42 was not found/,
    },
    {
      legacy: "REAL_BET_ALREADY_EXISTS:9",
      code: "REAL_BET_ALREADY_EXISTS" as const,
      message: /already marked as a real bet/,
    },
    {
      legacy: "CONTEST_TARGET_MISMATCH:3000:3001",
      code: "CONTEST_TARGET_MISMATCH" as const,
      message: /targets contest 3000.*contest 3001/,
    },
    {
      legacy: "RESULT_ALREADY_KNOWN:3000",
      code: "RESULT_ALREADY_KNOWN" as const,
      message: /Contest 3000 is already stored/,
    },
    {
      legacy: "CONTEST_NUMBER_REQUIRED",
      code: "CONTEST_NUMBER_REQUIRED" as const,
      message: /contest number is required/,
    },
    {
      legacy: "INVALID_GAME_POSITIONS",
      code: "INVALID_GAME_POSITIONS" as const,
      message: /gamePositions contains a game that does not exist/,
    },
    {
      legacy: "INVALID_PLAYED_AT",
      code: "INVALID_PLAYED_AT" as const,
      message: /playedAt is invalid/,
    },
  ];

  for (const item of cases) {
    const useCase = new RealBetUseCase(
      operations({ async create() { throw new Error(item.legacy); } }),
      revisions(),
    );
    await assertUseCaseError(() => useCase.create(input), item.code, item.message);
  }
});

test("RealBetUseCase owns pending reconciliation and checked-result state transitions", async () => {
  let pendingLottery: string | undefined;
  const checked = snapshot();
  const useCase = new RealBetUseCase(
    operations({
      async reconcilePending(lottery) {
        pendingLottery = lottery;
        return 3;
      },
      async reconcile() {
        return checked;
      },
    }),
    revisions(),
  );

  assert.deepEqual(await useCase.reconcilePending("mega-sena"), { checked: 3 });
  assert.equal(pendingLottery, "mega-sena");
  assert.equal(await useCase.check(7), checked);
});

test("RealBetUseCase exposes not-found and unavailable-result states without HTTP", async () => {
  const missing = new RealBetUseCase(
    operations({ async reconcile() { return undefined; } }),
    revisions(),
  );
  await assertUseCaseError(() => missing.check(99), "REAL_BET_NOT_FOUND", /Real bet 99 was not found/);

  const pending = new RealBetUseCase(
    operations({ async reconcile() { return snapshot({ status: "awaiting_result" }); } }),
    revisions(),
  );
  await assertUseCaseError(
    () => pending.check(7),
    "RESULT_NOT_AVAILABLE",
    /Contest 3000 is not stored yet for mega-sena/,
  );
});

test("RealBetUseCase reads financial revisions only for an existing bet and delegates listing", async () => {
  const revision = { id: 1, reason: "official-prize-refresh" };
  let listedLimit = 0;
  const useCase = new RealBetUseCase(
    operations({
      async list(_lottery, limit) {
        listedLimit = limit;
        return { items: [snapshot()] };
      },
    }),
    revisions({ async listFinancialRevisions() { return [revision]; } }),
  );

  assert.deepEqual(await useCase.financialRevisions(7), {
    realBetId: 7,
    revisions: [revision],
  });
  assert.deepEqual(await useCase.list("mega-sena", 25), { items: [snapshot()] });
  assert.equal(listedLimit, 25);

  const missing = new RealBetUseCase(
    operations(),
    revisions({ async findById() { return undefined; } }),
  );
  await assertUseCaseError(
    () => missing.financialRevisions(88),
    "REAL_BET_NOT_FOUND",
    /Real bet 88 was not found/,
  );
});
