import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Execuções keeps lifecycle in the feature root and presentation in a pure owner", async () => {
  const [jobs, presentation, context] = await Promise.all([
    readFile("web/src/features/jobs.ts", "utf8"),
    readFile("web/src/features/jobs/presentation.ts", "utf8"),
    readFile("web/src/core/mainContext.ts", "utf8"),
  ]);

  assert.match(jobs, /import \{ isLotteryId \} from "\.\.\/core\/mainContext\.js"/);
  assert.match(jobs, /renderJobCard, type AnalysisJob/);
  assert.doesNotMatch(jobs, /type LotteryId\s*=/);
  assert.doesNotMatch(jobs, /function renderJobCard\(/);
  assert.doesNotMatch(jobs, /function ownerAction\(/);

  assert.match(presentation, /import type \{ LotteryId \} from "\.\.\/\.\.\/core\/mainContext\.js"/);
  assert.match(presentation, /export function renderJobCard\(/);
  assert.match(presentation, /function ownerAction\(/);
  assert.doesNotMatch(presentation, /\bapi\s*</);
  assert.doesNotMatch(presentation, /document\.|window\.|localStorage|sessionStorage/);

  assert.match(context, /export type LotteryId/);
  assert.match(context, /export function isLotteryId/);
});
