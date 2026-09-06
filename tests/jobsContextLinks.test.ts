import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Execuções links completed backtests by jobId and keeps lifecycle separate", async () => {
  const [jobs, backtests] = await Promise.all([
    readFile("web/src/features/jobs.ts", "utf8"),
    readFile("web/src/features/backtests.ts", "utf8"),
  ]);

  assert.match(jobs, /job\.status === "completed" \|\| job\.status === "succeeded"/);
  assert.match(jobs, /jobId=\$\{encodeURIComponent\(String\(job\.id\)\)\}/);
  assert.match(jobs, /href="\/lab">Abrir Laboratório<\/a>/);
  assert.match(jobs, /: "\/#backtests"/);
  assert.doesNotMatch(jobs, /localStorage\.setItem\([^)]*job/i);
  assert.doesNotMatch(jobs, /winner=.*href|ranking=.*href|adjustedPValue=.*href/i);

  assert.match(backtests, /\/analysis-jobs\/\$\{encodeURIComponent\(String\(linkedJobId\)\)\}/);
  assert.match(backtests, /job\.kind !== "backtest"/);
  assert.match(backtests, /job\.lottery !== lottery/);
  assert.match(backtests, /job\.status !== "completed" && job\.status !== "succeeded"/);
  assert.match(backtests, /Este resultado foi resolvido pelo job persistido/);
  assert.doesNotMatch(backtests, /localStorage\.setItem\("loto-lab:lottery", linkedLottery\)/);
});
