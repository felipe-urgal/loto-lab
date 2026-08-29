import test from "node:test";
import assert from "node:assert/strict";
import type { Contest } from "../src/domain/types.js";
import { buildAdvancedAnalysis } from "../src/analysis/advanced.js";
import { alignRecentFrequencyWindows } from "../src/analysis/advancedConsistency.js";
import { runAdvancedAnalysisInWorker } from "../src/analysis/advancedWorkerClient.js";
import { getLotteryConfig } from "../src/lotteries/config.js";

function megaContest(number: number): Contest {
  const offset = number - 100;
  const numbers = Array.from({ length: 6 }, (_, index) => ((offset * 7 + index * 11) % 60) + 1)
    .sort((a, b) => a - b);
  return {
    lottery: "mega-sena",
    number,
    date: `2026-01-${String(offset + 1).padStart(2, "0")}`,
    numbers,
  };
}

test("advanced recent frequency explanations never bridge a missing contest", () => {
  const config = getLotteryConfig("mega-sena");
  const contests = Array.from({ length: 12 }, (_, index) => megaContest(100 + index))
    .filter((contest) => contest.number !== 110);
  const latest = contests.at(-1)!;
  assert.equal(latest.number, 111);

  const analysis = alignRecentFrequencyWindows(
    buildAdvancedAnalysis(contests, config),
    contests,
    config,
  );

  const present = latest.numbers[0]!;
  const absent = Array.from({ length: 60 }, (_, index) => index + 1)
    .find((number) => !latest.numbers.includes(number))!;
  const presentItem = analysis.ranking.dynamics.items.find((item) => item.number === present)!;
  const absentItem = analysis.ranking.dynamics.items.find((item) => item.number === absent)!;

  assert.deepEqual(presentItem.frequency.recent10, { number: present, count: 1, rate: 1 });
  assert.deepEqual(presentItem.frequency.recent20, { number: present, count: 1, rate: 1 });
  assert.deepEqual(absentItem.frequency.recent10, { number: absent, count: 0, rate: 0 });
  assert.deepEqual(absentItem.frequency.recent20, { number: absent, count: 0, rate: 0 });
});

test("advanced worker rejects invalid timeout bounds before starting execution", async () => {
  for (const timeoutMs of [0, 999, Number.NaN, Number.POSITIVE_INFINITY, 600_001]) {
    await assert.rejects(
      () => runAdvancedAnalysisInWorker([], "mega-sena", timeoutMs),
      /timeout must be between 1000 and 600000 ms/i,
    );
  }
});
