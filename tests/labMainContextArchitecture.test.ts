import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(path: string): Promise<string> {
  return readFile(path, "utf8");
}

test("Lab reuses the shared typed lottery identity and validation contract", async () => {
  const [lab, context] = await Promise.all([
    source("web/src/features/lab.ts"),
    source("web/src/core/mainContext.ts"),
  ]);

  assert.match(context, /export type LotteryId/);
  assert.match(context, /export function isLotteryId/);
  assert.match(lab, /import \{ isLotteryId \} from "\.\.\/core\/mainContext\.js"/);
  assert.match(lab, /import type \{ LotteryId \} from "\.\.\/core\/mainContext\.js"/);
  assert.doesNotMatch(lab, /type LotteryId\s*=/);
  assert.doesNotMatch(lab, /function isLotteryId\s*\(/);
  assert.match(lab, /Record<LotteryId, LotteryConfig>/);
});
