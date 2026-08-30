import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("backtest catalog routes live exclusively in the feature controller", async () => {
  const [app, controller, services] = await Promise.all([
    source("src/api/app.ts"),
    source("src/api/backtests.ts"),
    source("src/api/services.ts"),
  ]);

  assert.doesNotMatch(app, /services\.backtests\.findById/);
  assert.doesNotMatch(app, /services\.listBacktests/);
  assert.doesNotMatch(services, /listBacktests\s*\(/);

  assert.match(controller, /const runMatch =/);
  assert.match(controller, /const listMatch =/);
  assert.match(controller, /catalog\.get\(id\)/);
  assert.match(controller, /catalog\.list\(lottery,/);
  assert.match(controller, /listMatch\[1\] !== "run"/);
});
