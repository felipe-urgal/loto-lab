import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Contest } from "../src/domain/types.js";
import {
  contestsForLottery,
  loadContests,
  mergeContests,
  upsertContests,
} from "../src/data/jsonStore.js";

const mega100: Contest = {
  lottery: "mega-sena",
  number: 100,
  date: "2026-01-01",
  numbers: [1, 2, 3, 4, 5, 6],
};

const mega101: Contest = {
  lottery: "mega-sena",
  number: 101,
  date: "2026-01-03",
  numbers: [7, 8, 9, 10, 11, 12],
};

test("mergeContests replaces duplicate lottery/contest keys", () => {
  const replacement: Contest = {
    ...mega100,
    numbers: [10, 20, 30, 40, 50, 60],
  };

  const merged = mergeContests([mega100, mega101], [replacement]);

  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0], replacement);
});

test("upsertContests persists and reloads contests", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loto-lab-"));
  const path = join(directory, "contests.json");

  try {
    await upsertContests(path, [mega101]);
    await upsertContests(path, [mega100]);

    const loaded = await loadContests(path);
    assert.deepEqual(contestsForLottery(loaded, "mega-sena"), [mega100, mega101]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
