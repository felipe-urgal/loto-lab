import test from "node:test";
import assert from "node:assert/strict";
import type { Contest } from "../src/domain/types.js";
import { buildNumberAnalysis } from "../src/analysis/scoring.js";
import { getLotteryConfig } from "../src/lotteries/config.js";

function balancedMegaHistory(blocks = 3): Contest[] {
  const contests: Contest[] = [];
  let contestNumber = 1;
  for (let block = 0; block < blocks; block += 1) {
    for (let row = 0; row < 10; row += 1) {
      contests.push({
        lottery: "mega-sena",
        number: contestNumber,
        date: `2026-01-${String(contestNumber).padStart(2, "0")}`,
        numbers: Array.from({ length: 6 }, (_, offset) => row * 6 + offset + 1),
      });
      contestNumber += 1;
    }
  }
  return contests;
}

test("Score v2 does not manufacture strong/cold tiers when every window is exactly at expectation", () => {
  const config = getLotteryConfig("mega-sena");
  const analysis = buildNumberAnalysis(balancedMegaHistory(), config, undefined, "score-v2");

  assert.equal(analysis.length, 60);
  assert.ok(analysis.every((row) => row.score === 50));
  assert.ok(analysis.every((row) => row.tier === "balanced"));
  assert.ok(analysis.every((row) => row.historical === 50 && row.recent10 === 50 && row.recent20 === 50));
});

test("Score v2 recent windows stop at the latest internal history gap", () => {
  const config = getLotteryConfig("mega-sena");
  const history = balancedMegaHistory().filter((contest) => contest.number !== 25);
  const continuousTail = history.filter((contest) => contest.number >= 26);

  const withGap = buildNumberAnalysis(history, config, undefined, "score-v2");
  const tailOnly = buildNumberAnalysis(continuousTail, config, undefined, "score-v2");

  assert.equal(continuousTail.length, 5);
  for (const row of withGap) {
    const tailRow = tailOnly.find((candidate) => candidate.number === row.number)!;
    assert.equal(row.recent10, tailRow.recent10);
    assert.equal(row.recent20, tailRow.recent20);
  }
});

test("no-score model is a structural control with neutral ranking", () => {
  const config = getLotteryConfig("mega-sena");
  const analysis = buildNumberAnalysis(balancedMegaHistory(1), config, undefined, "no-score");

  assert.equal(analysis.length, 60);
  assert.ok(analysis.every((row) => row.score === 50));
  assert.ok(analysis.every((row) => row.tier === "balanced"));
});

test("score-v1 remains available as a legacy comparison model", () => {
  const config = getLotteryConfig("mega-sena");
  const history = balancedMegaHistory(2);
  history.push({
    lottery: "mega-sena",
    number: 21,
    date: "2026-02-01",
    numbers: [1, 2, 3, 4, 5, 6],
  });

  const v1 = buildNumberAnalysis(history, config, undefined, "score-v1");
  const v2 = buildNumberAnalysis(history, config, undefined, "score-v2");
  assert.equal(v1.length, v2.length);
  assert.ok(v1.some((row, index) => row.score !== v2[index]?.score));
});
