import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("advanced analysis delegates rolling validation to a focused owner", async () => {
  const [advanced, validation] = await Promise.all([
    readFile("src/analysis/advanced.ts", "utf8"),
    readFile("src/analysis/validation.ts", "utf8"),
  ]);

  assert.match(advanced, /import \{ buildRollingValidation \} from "\.\/validation\.js"/);
  assert.match(advanced, /validation: buildRollingValidation\(scoped, config\)/);
  assert.doesNotMatch(advanced, /ANALYSIS_WINDOWS/);
  assert.doesNotMatch(advanced, /MIN_VALIDATION_HISTORY/);
  assert.doesNotMatch(advanced, /VALIDATION_COMPARISONS/);
  assert.doesNotMatch(advanced, /function aggregateValidation\(/);
  assert.doesNotMatch(advanced, /function buildRollingValidation\(/);

  assert.match(validation, /export function buildRollingValidation\(/);
  assert.match(validation, /function aggregateValidation\(/);
  assert.match(validation, /from "\.\/continuity\.js"/);
  assert.match(validation, /from "\.\/frequency\.js"/);
  assert.match(validation, /from "\.\/scoring\.js"/);
  assert.match(validation, /from "\.\/statistics\.js"/);
  assert.doesNotMatch(validation, /from "\.\/advanced\.js"/);
  assert.doesNotMatch(validation, /dynamics\.js|associations\.js|cycles\.js|structure\.js/);
  assert.doesNotMatch(validation, /buildAdvancedAnalysis/);
});
