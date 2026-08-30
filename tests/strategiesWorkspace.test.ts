import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("strategies workspace follows Prototype 1 while preserving immutable version contracts", async () => {
  const [html, workspace, strategies] = await Promise.all([
    readFile("web/strategies.html", "utf8"),
    readFile("web/strategies-workspace.css", "utf8"),
    readFile("web/strategies.js", "utf8"),
  ]);

  const experiments = html.indexOf('/assets/experiments.css');
  const workspaceLayer = html.indexOf('/assets/strategies-workspace.css');
  assert.ok(experiments >= 0, "shared experiment styles must remain available");
  assert.ok(workspaceLayer > experiments, "Prototype 1 must be the final Strategies presentation layer");

  assert.match(workspace, /\.experiment-grid \{[\s\S]*max-width: 1440px/);
  assert.match(workspace, /\.experiment-form \.form-grid \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /\.experiment-card \.status-pill\.completed \{[\s\S]*background: var\(--accent-soft\)[\s\S]*color: var\(--accent-strong\)/);
  assert.match(workspace, /\.experiment-card-actions \.button\.primary \{[\s\S]*background: var\(--accent\)/);
  assert.match(workspace, /@media \(max-width: 640px\)[\s\S]*\.experiment-card-actions \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(workspace, /font-size:\s*(?:[0-9]|1[0-5])px/);

  assert.match(strategies, /api\("\/strategies", \{/);
  assert.match(strategies, /method: "POST"/);
  assert.match(strategies, /api\(`\/strategies\/\$\{encodeURIComponent\(strategy\.slug\)\}\/versions`\)/);
  assert.match(strategies, /slug\.readOnly = !duplicate/);
  assert.match(strategies, /lottery\.disabled = !duplicate/);
  assert.match(strategies, /strategyVersionId=\$\{strategy\.latestVersionId\}/);
  assert.match(strategies, /strategyVersionId=\$\{version\.id\}/);
});
