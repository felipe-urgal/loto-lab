import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

test("strategies workspace follows Prototype 1 while preserving immutable version contracts", async () => {
  const [html, workspace, strategies] = await Promise.all([
    readFile("web/strategies.html", "utf8"),
    readFile("web/strategies-workspace.css", "utf8"),
    readFile("web/strategies.js", "utf8"),
  ]);

  assert.match(html, /\/assets\/strategies-workspace\.css/);
  assert.doesNotMatch(html, /\/assets\/experiments\.css/);
  await assert.rejects(access("web/experiments.css"));

  assert.match(workspace, /\.experiment-grid \{[\s\S]*display: grid[\s\S]*align-items: start/);
  assert.match(workspace, /\.experiment-grid \{[\s\S]*max-width: 1440px/);
  assert.match(workspace, /\.experiment-form \{[\s\S]*position: sticky/);
  assert.match(workspace, /\.experiment-card-head \{[\s\S]*display: flex[\s\S]*justify-content: space-between/);
  assert.match(workspace, /\.version-list \{[\s\S]*display: grid/);
  assert.match(workspace, /\.version-row \{[\s\S]*display: grid[\s\S]*align-items: center/);
  assert.match(workspace, /\.experiment-form \.form-grid \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /\.experiment-card \.status-pill\.completed \{[\s\S]*background: var\(--accent-soft\)[\s\S]*color: var\(--accent-strong\)/);
  assert.match(workspace, /\.experiment-card-actions \.button\.primary \{[\s\S]*background: var\(--accent\)/);
  assert.match(workspace, /@media \(max-width: 980px\)[\s\S]*\.experiment-form \{[\s\S]*position: static/);
  assert.match(workspace, /@media \(max-width: 680px\)[\s\S]*\.experiment-card-head \{[\s\S]*flex-direction: column/);
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
