import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(path: string): Promise<string> {
  return readFile(path, "utf8");
}

test("main shell and lifecycle share one typed view/lottery contract", async () => {
  const [context, shell, lifecycle] = await Promise.all([
    source("web/src/core/mainContext.ts"),
    source("web/src/core/shell.ts"),
    source("web/src/core/viewLifecycle.ts"),
  ]);

  assert.match(context, /MAIN_VIEWS/);
  assert.match(context, /LOTTERY_IDS/);
  assert.match(context, /export function isMainView/);
  assert.match(context, /export function isLotteryId/);
  assert.match(context, /return hash\.replace\(\/\^#\/, ""\) \|\| "dashboard"/);

  assert.match(shell, /from "\.\/mainContext\.js"/);
  assert.match(shell, /view\?: MainView/);
  assert.match(shell, /isMainView\(requested\)/);
  assert.match(shell, /isLotteryId\(storedLottery\)/);
  assert.doesNotMatch(shell, /const mainViews = new Set/);
  assert.doesNotMatch(shell, /const lotteries = new Set/);

  assert.match(lifecycle, /from "\.\/mainContext\.js"/);
  assert.match(lifecycle, /export \{ mainViewFromHash \} from "\.\/mainContext\.js"/);
  assert.doesNotMatch(lifecycle, /hash\.replace\(\/\^#\//);
});
