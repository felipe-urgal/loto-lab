import test from "node:test";
import assert from "node:assert/strict";
import { ReconcileContestDataUseCase } from "../src/application/reconcileContestData.js";
import type { Contest } from "../src/domain/types.js";
import type { SecondaryContestSource } from "../src/data/secondarySource.js";
import { SecondarySourceUnavailableError } from "../src/data/maickonSecondarySource.js";

function contest(number: number, date: string, numbers: number[]): Contest {
  return { lottery: "mega-sena", number, date, numbers };
}

const canonical = [
  contest(3046, "2026-08-18", [16,23,24,33,36,52]),
  contest(3045, "2026-08-15", [1,2,3,4,5,6]),
  contest(3044, "2026-08-13", [7,8,9,10,11,12]),
];

function reader(items = canonical) {
  return {
    list: async () => items,
  };
}

test("reconciliation classifies consistent, divergence and missing contests precisely", async () => {
  const source: SecondaryContestSource = {
    provider: "test-secondary",
    supports: () => true,
    latestContestNumber: async () => 3046,
    fetchContest: async (_lottery, number) => {
      if (number === 3046) return {
        lottery: "mega-sena",
        contestNumber: 3046,
        drawDate: "2026-08-18",
        numbers: [16,23,24,33,36,52],
        source: { provider: "test", url: "test://3046", fetchedAt: "2026-10-02T12:00:00Z" },
      };
      if (number === 3045) return {
        lottery: "mega-sena",
        contestNumber: 3045,
        drawDate: "2026-08-14",
        numbers: [1,2,3,4,5,60],
        source: { provider: "test", url: "test://3045", fetchedAt: "2026-10-02T12:00:00Z" },
      };
      return undefined;
    },
  };
  const useCase = new ReconcileContestDataUseCase(reader(), source, () => "2026-10-02T12:30:00Z");

  const result = await useCase.execute("mega-sena", 3);

  assert.equal(result.readonly, true);
  assert.equal(result.counts.consistent, 1);
  assert.equal(result.counts["content-divergence"], 1);
  assert.equal(result.counts["contest-missing"], 1);
  assert.deepEqual(result.items[1]?.differences, ["drawDate", "numbers"]);
  assert.equal(result.compared, 2);
});

test("reconciliation marks newer canonical contests as secondary stale", async () => {
  const source: SecondaryContestSource = {
    provider: "test-secondary",
    supports: () => true,
    latestContestNumber: async () => 3044,
    fetchContest: async () => undefined,
  };
  const result = await new ReconcileContestDataUseCase(reader(), source).execute("mega-sena", 3);

  assert.equal(result.counts["secondary-stale"], 2);
  assert.equal(result.items[0]?.status, "secondary-stale");
  assert.equal(result.items[1]?.status, "secondary-stale");
  assert.equal(result.items[2]?.status, "contest-missing");
});

test("secondary outage is isolated and never mutates canonical data", async () => {
  let listCalls = 0;
  const source: SecondaryContestSource = {
    provider: "test-secondary",
    supports: () => true,
    latestContestNumber: async () => {
      throw new SecondarySourceUnavailableError("offline");
    },
    fetchContest: async () => {
      throw new Error("should not fetch");
    },
  };
  const useCase = new ReconcileContestDataUseCase({
    list: async () => {
      listCalls += 1;
      return canonical;
    },
  }, source);

  const result = await useCase.execute("mega-sena", 3);

  assert.equal(listCalls, 1);
  assert.equal(result.counts["source-unavailable"], 3);
  assert.equal(result.compared, 0);
  assert.ok(result.items.every((item) => item.secondary === undefined));
});

test("reconciliation is bounded to at most 20 canonical contests", async () => {
  const source: SecondaryContestSource = {
    provider: "test-secondary",
    supports: () => true,
    latestContestNumber: async () => 1,
    fetchContest: async () => undefined,
  };
  const useCase = new ReconcileContestDataUseCase(reader(), source);
  await assert.rejects(() => useCase.execute("mega-sena", 21), /between 1 and 20/);
});

test("unsupported lottery is rejected before any external call", async () => {
  let externalCalls = 0;
  const source: SecondaryContestSource = {
    provider: "test-secondary",
    supports: () => false,
    latestContestNumber: async () => {
      externalCalls += 1;
      return 0;
    },
    fetchContest: async () => undefined,
  };
  const useCase = new ReconcileContestDataUseCase(reader(), source);
  await assert.rejects(() => useCase.execute("quina", 5), /not supported/);
  assert.equal(externalCalls, 0);
});
