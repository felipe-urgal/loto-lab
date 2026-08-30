import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("backtest catalog routes live exclusively in the feature controller", async () => {
  const [app, controller, services] = await Promise.all([
    source("src/api/app.ts"),
    source("src/api/backtests.ts"),
    source("src/api/services.ts"),
  ]);

  assert.doesNotMatch(app, /\/api\/v1\/backtest-runs/);
  assert.doesNotMatch(app, /\/api\/v1\/backtests\/\(\[\^\/\]\+\)/);
  assert.doesNotMatch(services, /listBacktests\s*\(/);

  assert.match(controller, /\/api\/v1\/backtest-runs/);
  assert.match(controller, /\/api\/v1\/backtests/);
  assert.match(controller, /listMatch\[1\] !== "run"/);
});
