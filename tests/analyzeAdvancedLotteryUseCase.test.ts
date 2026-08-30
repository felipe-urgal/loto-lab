import test from "node:test";
import assert from "node:assert/strict";
import type { AdvancedAnalysis } from "../src/analysis/advancedTypes.js";
import {
  AnalyzeAdvancedLotteryUseCase,
  type AdvancedAnalysisHistoryReader,
} from "../src/application/analyzeAdvancedLottery.js";
import type { Contest } from "../src/domain/types.js";

function makeMegaContests(count: number): Contest[] {
  return Array.from({ length: count }, (_, index) => ({
    lottery: "mega-sena" as const,
    number: index + 1,
    date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    numbers: Array.from({ length: 6 }, (_, offset) => ((index * 5 + offset * 7) % 60) + 1)
      .sort((a, b) => a - b),
  }));
}

function fakeAdvanced(historySize: number): AdvancedAnalysis {
  return { historySize } as AdvancedAnalysis;
}

test("AnalyzeAdvancedLotteryUseCase shares in-flight work and reuses a matching cache", async () => {
  let contests = makeMegaContests(3);
  let executions = 0;
  let historyReads = 0;
  let releaseFirst!: () => void;
  let markFirstStarted!: () => void;
  let markSecondHistoryRead!: () => void;
  const firstStarted = new Promise<void>((resolve) => {
    markFirstStarted = resolve;
  });
  const secondHistoryRead = new Promise<void>((resolve) => {
    markSecondHistoryRead = resolve;
  });
  const firstBlocked = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const history: AdvancedAnalysisHistoryReader = {
    async listAnalysisHistory() {
      historyReads += 1;
      if (historyReads === 2) markSecondHistoryRead();
      return contests;
    },
  };
  const useCase = new AnalyzeAdvancedLotteryUseCase(history, async (received) => {
    executions += 1;
    if (executions === 1) {
      markFirstStarted();
      await firstBlocked;
    }
    return fakeAdvanced(received.length);
  });

  const first = useCase.execute("mega-sena");
  await firstStarted;
  const second = useCase.execute("mega-sena");
  await secondHistoryRead;
  await Promise.resolve();
  assert.equal(executions, 1);

  releaseFirst();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.advanced.historySize, 3);
  assert.deepEqual(secondResult, firstResult);

  const cached = await useCase.execute("mega-sena");
  assert.equal(cached.advanced.historySize, 3);
  assert.equal(executions, 1);

  contests = makeMegaContests(4);
  const refreshed = await useCase.execute("mega-sena");
  assert.equal(refreshed.advanced.historySize, 4);
  assert.equal(executions, 2);
});

test("AnalyzeAdvancedLotteryUseCase clears failed in-flight work so the same revision can retry", async () => {
  const contests = makeMegaContests(2);
  let executions = 0;
  const useCase = new AnalyzeAdvancedLotteryUseCase(
    {
      async listAnalysisHistory() {
        return contests;
      },
    },
    async (received) => {
      executions += 1;
      if (executions === 1) throw new Error("temporary analysis failure");
      return fakeAdvanced(received.length);
    },
  );

  await assert.rejects(() => useCase.execute("mega-sena"), /temporary analysis failure/);
  const retried = await useCase.execute("mega-sena");

  assert.equal(retried.advanced.historySize, 2);
  assert.equal(executions, 2);
});
