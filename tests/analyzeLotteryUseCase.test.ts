import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, LotteryId } from "../src/domain/types.js";
import {
  AnalyzeLotteryUseCase,
  type AnalysisHistoryReader,
} from "../src/application/analyzeLottery.js";

function repeatedMegaHistory(count: number): Contest[] {
  return Array.from({ length: count }, (_, index) => ({
    lottery: "mega-sena" as const,
    number: index + 1,
    date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    numbers: [1, 2, 3, 4, 5, 6],
  }));
}

function memoryHistory(contests: Contest[]) {
  const requested: LotteryId[] = [];
  const reader: AnalysisHistoryReader = {
    async listAnalysisHistory(lottery) {
      requested.push(lottery);
      return contests.filter((contest) => contest.lottery === lottery);
    },
  };
  return { reader, requested };
}

test("AnalyzeLotteryUseCase builds analysis from an application port without HTTP or PostgreSQL", async () => {
  const contests = repeatedMegaHistory(10);
  const { reader, requested } = memoryHistory(contests);
  const useCase = new AnalyzeLotteryUseCase(reader);

  const result = await useCase.execute("mega-sena");

  assert.deepEqual(requested, ["mega-sena"]);
  assert.equal(result.lottery, "mega-sena");
  assert.deepEqual(result.latestContest, contests.at(-1));
  assert.deepEqual(result.weights, {
    year: 0.3,
    recent20: 0.25,
    month: 0.2,
    historical: 0.15,
    recent10: 0.1,
  });
  assert.equal(result.numbers.length, 60);
  assert.deepEqual(result.tiers.strong, [1, 2, 3, 4, 5, 6]);
  assert.equal(result.tiers.balanced.length, 0);
  assert.equal(result.tiers.cold.length, 54);
  assert.deepEqual(result.tiers.cold.slice(0, 3), [7, 8, 9]);
});

test("AnalyzeLotteryUseCase returns a neutral analysis when history is empty", async () => {
  const { reader } = memoryHistory([]);
  const useCase = new AnalyzeLotteryUseCase(reader);

  const result = await useCase.execute("mega-sena");

  assert.equal(result.latestContest, null);
  assert.equal(result.numbers.length, 60);
  assert.equal(result.tiers.strong.length, 0);
  assert.equal(result.tiers.cold.length, 0);
  assert.equal(result.tiers.balanced.length, 60);
  assert.ok(result.numbers.every((row) => row.score === 50 && row.tier === "balanced"));
});
