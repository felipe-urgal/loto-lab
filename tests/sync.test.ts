import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Contest, LotteryId } from "../src/domain/types.js";
import type { ContestSource } from "../src/data/source.js";
import { loadContests, upsertContests } from "../src/data/jsonStore.js";
import { missingContestNumbers, syncMissingContests } from "../src/data/sync.js";

function mega(number: number): Contest {
  return {
    lottery: "mega-sena",
    number,
    date: `2026-02-${String(number).padStart(2, "0")}`,
    numbers: [1, 10, 20, 30, 40, 50],
  };
}

class FakeSource implements ContestSource {
  public fetched: number[] = [];

  async fetchContest(lottery: LotteryId, contestNumber?: number): Promise<Contest> {
    assert.equal(lottery, "mega-sena");
    const number = contestNumber ?? 3;
    this.fetched.push(number);
    return mega(number);
  }

  async fetchContestRange(
    lottery: LotteryId,
    startContest: number,
    endContest: number,
  ): Promise<Contest[]> {
    const contests: Contest[] = [];
    for (let number = startContest; number <= endContest; number += 1) {
      contests.push(await this.fetchContest(lottery, number));
    }
    return contests;
  }
}

test("syncMissingContests fetches only gaps already absent from the store", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loto-lab-sync-"));
  const path = join(directory, "contests.json");
  const source = new FakeSource();

  try {
    await upsertContests(path, [mega(1), mega(3)]);
    assert.deepEqual(await missingContestNumbers(path, "mega-sena", 1, 3), [2]);

    const result = await syncMissingContests(path, source, "mega-sena", 1, 3);

    assert.deepEqual(source.fetched, [2]);
    assert.equal(result.fetched, 1);
    assert.equal(result.totalStored, 3);
    assert.equal((await loadContests(path)).length, 3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
