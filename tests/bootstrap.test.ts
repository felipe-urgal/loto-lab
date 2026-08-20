import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, LotteryId } from "../src/domain/types.js";
import type { ContestSource } from "../src/data/source.js";
import { bootstrapLotteryHistory } from "../src/data/bootstrap.js";

function contest(number: number): Contest {
  return {
    lottery: "mega-sena",
    number,
    date: `2026-01-${String(number).padStart(2, "0")}`,
    numbers: [1, 2, 3, 4, 5, 6],
  };
}

class FakeSource implements ContestSource {
  attempts = new Map<number, number>();

  async fetchContest(_lottery: LotteryId, contestNumber?: number): Promise<Contest> {
    if (contestNumber === undefined) return contest(5);
    const attempts = (this.attempts.get(contestNumber) ?? 0) + 1;
    this.attempts.set(contestNumber, attempts);
    if (contestNumber === 4 && attempts < 3) {
      throw new Error("temporary failure");
    }
    return contest(contestNumber);
  }

  async fetchContestRange(): Promise<Contest[]> {
    throw new Error("not used by bootstrap");
  }
}

class FakeStore {
  values = new Map<number, Contest>([
    [1, contest(1)],
    [3, contest(3)],
  ]);

  async listContestNumbers(
    _lottery: LotteryId,
    startContest: number,
    endContest: number,
  ): Promise<number[]> {
    return [...this.values.keys()]
      .filter((number) => number >= startContest && number <= endContest)
      .sort((a, b) => a - b);
  }

  async upsertMany(contests: Contest[]): Promise<void> {
    for (const item of contests) this.values.set(item.number, item);
  }
}

test("historical bootstrap fills only gaps, retries transient failures and is resumable", async () => {
  const source = new FakeSource();
  const store = new FakeStore();
  const progress: number[] = [];

  const first = await bootstrapLotteryHistory(source, store, "mega-sena", {
    concurrency: 2,
    retries: 2,
    retryDelayMs: 0,
    onProgress: (item) => progress.push(item.processed),
  });

  assert.equal(first.latestOfficialContest, 5);
  assert.equal(first.existingBefore, 2);
  assert.equal(first.missingBefore, 3);
  assert.equal(first.fetched, 3);
  assert.equal(first.failed, 0);
  assert.equal(first.totalStored, 5);
  assert.equal(source.attempts.get(2), 1);
  assert.equal(source.attempts.get(4), 3);
  assert.equal(source.attempts.get(5), 1);
  assert.deepEqual(progress, [2, 3]);

  source.attempts.clear();
  const second = await bootstrapLotteryHistory(source, store, "mega-sena", {
    retryDelayMs: 0,
  });

  assert.equal(second.missingBefore, 0);
  assert.equal(second.fetched, 0);
  assert.equal(second.totalStored, 5);
  assert.deepEqual([...source.attempts.keys()], []);
});

test("historical bootstrap records permanent failures without discarding successes", async () => {
  const source = new FakeSource();
  source.fetchContest = async (_lottery, contestNumber) => {
    if (contestNumber === undefined) return contest(4);
    if (contestNumber === 2) throw new Error("permanent failure");
    return contest(contestNumber);
  };
  const store = new FakeStore();
  store.values = new Map([[1, contest(1)]]);

  const result = await bootstrapLotteryHistory(source, store, "mega-sena", {
    concurrency: 3,
    retries: 1,
    retryDelayMs: 0,
  });

  assert.equal(result.fetched, 2);
  assert.equal(result.failed, 1);
  assert.deepEqual(result.failures.map((item) => item.contest), [2]);
  assert.deepEqual(await store.listContestNumbers("mega-sena", 1, 4), [1, 3, 4]);
});
