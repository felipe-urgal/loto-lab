import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Execuções links back to canonical owners without cross-surface state", async () => {
  const source = await readFile("web/src/features/jobs.ts", "utf8");

  assert.match(source, /href="\/#backtests">Abrir Testes históricos<\/a>/);
  assert.match(source, /href="\/lab">Abrir Laboratório<\/a>/);
  assert.match(source, /job\.kind === "backtest"/);
  assert.doesNotMatch(source, /jobId=|URLSearchParams\([^)]*job|localStorage\.setItem\([^)]*job/i);
  assert.doesNotMatch(source, /winner=.*href|ranking=.*href|adjustedPValue=.*href/i);
});
