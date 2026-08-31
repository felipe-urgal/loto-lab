import test from "node:test";
import assert from "node:assert/strict";
import type { LotteryId } from "../src/domain/types.js";
import {
  GameBatchUseCase,
  type GameBatchScope,
  type GameBatchStore,
} from "../src/application/gameBatches.js";
import type { ApplicationGameBatch } from "../src/application/gameBatch.js";

const batch: ApplicationGameBatch = {
  id: 7,
  lottery: "mega-sena",
  targetContestNumber: 100,
  generatorOptions: { generationMode: "deterministic" },
  createdAt: "2026-08-31T00:00:00.000Z",
  hasRealBet: false,
  games: [],
};

function fakeStore() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const store: GameBatchStore = {
    async findBatch(id) {
      calls.push({ method: "findBatch", args: [id] });
      return id === batch.id ? batch : undefined;
    },
    async listRecent(lottery, limit, scope) {
      calls.push({ method: "listRecent", args: [lottery, limit, scope] });
      return lottery === batch.lottery ? [batch] : [];
    },
    async counts(lottery) {
      calls.push({ method: "counts", args: [lottery] });
      return { active: 1, archived: 2, realBets: 3 };
    },
    async setArchived(id, archived) {
      calls.push({ method: "setArchived", args: [id, archived] });
      return id === batch.id ? { ...batch, ...(archived ? { archivedAt: "2026-08-31T12:00:00.000Z" } : {}) } : undefined;
    },
  };
  return { store, calls };
}

test("GameBatchUseCase delegates batch reads without HTTP or PostgreSQL", async () => {
  const { store, calls } = fakeStore();
  const useCase = new GameBatchUseCase(store);

  assert.deepEqual(await useCase.find(7), batch);
  assert.deepEqual(await useCase.listRecent("mega-sena", 20), [batch]);
  assert.deepEqual(calls, [
    { method: "findBatch", args: [7] },
    { method: "listRecent", args: ["mega-sena", 20, "active"] },
  ]);
});

test("GameBatchUseCase owns management orchestration through the store port", async () => {
  const { store, calls } = fakeStore();
  const useCase = new GameBatchUseCase(store);
  const lottery: LotteryId = "mega-sena";
  const scope: GameBatchScope = "all";

  const managed = await useCase.manage(lottery, 100, scope);
  const hidden = await useCase.setHidden(7, true);
  const missing = await useCase.setHidden(404, false);

  assert.deepEqual(managed, {
    items: [batch],
    counts: { active: 1, archived: 2, realBets: 3 },
    scope: "all",
  });
  assert.equal(hidden?.id, 7);
  assert.ok(hidden?.archivedAt);
  assert.equal(missing, undefined);
  assert.deepEqual(calls, [
    { method: "listRecent", args: ["mega-sena", 100, "all"] },
    { method: "counts", args: ["mega-sena"] },
    { method: "setArchived", args: [7, true] },
    { method: "setArchived", args: [404, false] },
  ]);
});
