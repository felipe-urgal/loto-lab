import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("advanced analysis delegates cycles to a focused owner", async () => {
  const [advanced, cycles] = await Promise.all([
    readFile("src/analysis/advanced.ts", "utf8"),
    readFile("src/analysis/cycles.ts", "utf8"),
  ]);

  assert.match(advanced, /import \{ buildCycles \} from "\.\/cycles\.js"/);
  assert.match(advanced, /cycles: buildCycles\(scoped, config\)/);
  assert.doesNotMatch(advanced, /function buildCycles\(/);

  assert.match(cycles, /export function buildCycles\(/);
  assert.match(cycles, /from "\.\/continuity\.js"/);
  assert.match(cycles, /from "\.\/frequency\.js"/);
  assert.match(cycles, /from "\.\/statistics\.js"/);
  assert.doesNotMatch(cycles, /associations\.js|scoring\.js|structure\.js/);
  assert.doesNotMatch(cycles, /buildAdvancedAnalysis/);
});
