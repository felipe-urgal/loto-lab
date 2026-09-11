import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("advanced analysis delegates dynamics to a focused owner", async () => {
  const [advanced, dynamics] = await Promise.all([
    readFile("src/analysis/advanced.ts", "utf8"),
    readFile("src/analysis/dynamics.ts", "utf8"),
  ]);

  assert.match(advanced, /import \{ buildDynamics, tierMap \} from "\.\/dynamics\.js"/);
  assert.match(advanced, /dynamics: buildDynamics\(scoped, config, currentRows\)/);
  assert.doesNotMatch(advanced, /function rankRows\(/);
  assert.doesNotMatch(advanced, /function rankMap\(/);
  assert.doesNotMatch(advanced, /function currentDelay\(/);
  assert.doesNotMatch(advanced, /function currentStreak\(/);
  assert.doesNotMatch(advanced, /function robustnessByNumber\(/);
  assert.doesNotMatch(advanced, /function buildDynamics\(/);
  assert.doesNotMatch(advanced, /WEIGHT_MULTIPLIERS/);

  assert.match(dynamics, /export function buildDynamics\(/);
  assert.match(dynamics, /export function tierMap\(/);
  assert.match(dynamics, /from "\.\/continuity\.js"/);
  assert.match(dynamics, /from "\.\/frequency\.js"/);
  assert.match(dynamics, /from "\.\/scoring\.js"/);
  assert.match(dynamics, /from "\.\/statistics\.js"/);
  assert.doesNotMatch(dynamics, /associations\.js|cycles\.js|structure\.js/);
  assert.doesNotMatch(dynamics, /buildAdvancedAnalysis/);
});
