import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const TYPED_FEATURE_BOUNDARIES = [
  "web/shell.js",
  "web/feature-loader.js",
  "web/dashboard-scope.js",
  "web/data-status.js",
  "web/agenda.js",
  "web/ai.js",
  "web/strategies.js",
  "web/jobs.js",
  "web/lab.js",
  "web/my-games-v2.js",
  "web/analysis-v2.js",
  "web/generation-v2.js",
  "web/backtests.js",
] as const;

const SIDE_EFFECT_IMPORT = /^import\s+["'][^"']+\.js["'];$/;

test("migrated web feature boundaries remain import-only", async () => {
  for (const path of TYPED_FEATURE_BOUNDARIES) {
    const content = await readFile(path, "utf8");
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    assert.ok(lines.length > 0, `${path} must import at least one emitted TypeScript owner`);
    for (const line of lines) {
      assert.match(line, SIDE_EFFECT_IMPORT, `${path} must contain only side-effect imports`);
    }

    assert.doesNotMatch(
      content,
      /\b(?:function|class|const|let|var)\b|=>|document\.|window\.|fetch\(/,
      `${path} must not regain functional fallback code`,
    );
  }
});
