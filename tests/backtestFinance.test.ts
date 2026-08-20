import test from "node:test";
import assert from "node:assert/strict";
import type { GameCheckResult } from "../src/checker/evaluate.js";
import { summarizeBacktestRounds } from "../src/backtest/shared.js";

function check(overrides: Partial<GameCheckResult> = {}): GameCheckResult {
  return {
    lottery: "lotofacil",
    contest: 1,
    hits: 10,
    matchedNumbers: [],
    fixedHits: 5,
    fixedMatchedNumbers: [],
    variableHits: 5,
    variableMatchedNumbers: [],
    ticketCost: 3.5,
    totalPrizeValue: 0,
    netResult: -3.5,
    ...overrides,
  };
}

test("summarizeBacktestRounds calculates cost, return and ROI", () => {
  const summary = summarizeBacktestRounds([
    { checks: [check(), check({ hits: 11, prizeTier: "11-acertos", totalPrizeValue: 7, netResult: 3.5 })] },
    { checks: [check({ contest: 2 }), check({ contest: 2, hits: 12, prizeTier: "12-acertos", totalPrizeValue: 14, netResult: 10.5 })] },
  ]);

  assert.equal(summary.totalGames, 4);
  assert.equal(summary.totalCost, 14);
  assert.equal(summary.totalPrizeValue, 21);
  assert.equal(summary.netResult, 7);
  assert.equal(summary.returnRate, 1.5);
  assert.equal(summary.roi, 0.5);
  assert.equal(summary.financialCoverage, 1);
});

test("summarizeBacktestRounds reports partial financial coverage", () => {
  const summary = summarizeBacktestRounds([
    { checks: [check({ totalPrizeValue: undefined, netResult: undefined })] },
    { checks: [check({ contest: 2 })] },
  ]);

  assert.equal(summary.totalGames, 2);
  assert.equal(summary.financialGames, 1);
  assert.equal(summary.financialCoverage, 0.5);
});
