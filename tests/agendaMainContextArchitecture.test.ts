import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(path: string): Promise<string> {
  return readFile(path, "utf8");
}

test("Agenda reuses the shared typed lottery identity contract", async () => {
  const [agenda, context] = await Promise.all([
    source("web/src/features/agenda.ts"),
    source("web/src/core/mainContext.ts"),
  ]);

  assert.match(context, /export type LotteryId/);
  assert.match(agenda, /import type \{ LotteryId \} from "\.\.\/core\/mainContext\.js"/);
  assert.doesNotMatch(agenda, /type LotteryId\s*=/);
  assert.match(agenda, /Record<LotteryId, string>/);
});
