import test from "node:test";
import assert from "node:assert/strict";
import type { Contest } from "../src/domain/types.js";
import { runAdvancedAnalysisInWorker } from "../src/analysis/advancedWorkerClient.js";
import { AnalyzeAdvancedLotteryUseCase } from "../src/application/analyzeAdvancedLottery.js";
import { ApiError } from "../src/api/http.js";
import { expensiveAnalysisGate } from "../src/api/workGate.js";

function makeMegaContests(count: number): Contest[] {
  return Array.from({ length: count }, (_, index) => ({
    lottery: "mega-sena" as const,
    number: index + 1,
    date: `2026-${String((Math.floor(index / 28) % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
    numbers: Array.from({ length: 6 }, (_, offset) => ((index * 5 + offset * 7) % 60) + 1)
      .sort((a, b) => a - b),
  }));
}

test("advanced analysis shares in-flight work and serves cache while the expensive gate is busy", async () => {
  let contests = makeMegaContests(35);
  const analysis = new AnalyzeAdvancedLotteryUseCase(
    {
      async listAnalysisHistory() {
        return contests;
      },
    },
    runAdvancedAnalysisInWorker,
  );

  // The first request creates the worker and acquires the global gate. A second
  // request for the same revision must reuse the in-flight Promise instead of
  // trying to acquire a second slot and returning ANALYSIS_BUSY.
  const firstRequest = analysis.execute("mega-sena");
  const secondRequest = analysis.execute("mega-sena");
  const [first, second] = await Promise.all([firstRequest, secondRequest]);
  assert.deepEqual(second, first);
  assert.equal(first.advanced.historySize, 35);

  // Once the snapshot is cached, an unrelated expensive task may own the gate
  // without preventing this cheap cache hit from being served.
  const release = expensiveAnalysisGate.acquire();
  assert.ok(release, "test must be able to reserve the expensive-work gate");
  try {
    const cached = await analysis.execute("mega-sena");
    assert.equal(cached.advanced.historySize, 35);

    // A changed revision genuinely needs a new worker, so it must still honor
    // the shared gate while another expensive task is active.
    contests = makeMegaContests(36);
    await assert.rejects(
      () => analysis.execute("mega-sena"),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.statusCode, 429);
        assert.equal(error.code, "ANALYSIS_BUSY");
        return true;
      },
    );
  } finally {
    release();
  }

  // The rejected new revision must not poison the in-flight registry. Once the
  // gate is free, the same revision can create its worker and refresh the cache.
  const refreshed = await analysis.execute("mega-sena");
  assert.equal(refreshed.advanced.historySize, 36);
});
