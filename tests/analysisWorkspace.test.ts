import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("analysis workspace follows Prototype 1 without changing statistical contracts", async () => {
  const [loader, workspace, analysis] = await Promise.all([
    readFile("web/feature-loader.js", "utf8"),
    readFile("web/analysis-workspace.css", "utf8"),
    readFile("web/analysis-v2.js", "utf8"),
  ]);

  const baseStyle = loader.indexOf('loadStyle("analysis-v2")');
  const workspaceStyle = loader.indexOf('loadStyle("analysis-workspace")');
  const moduleLoad = loader.indexOf('loadModule("analysis-v2")');
  assert.ok(baseStyle >= 0, "analysis base style must load");
  assert.ok(workspaceStyle > baseStyle, "Prototype 1 workspace must be the final analysis style layer");
  assert.ok(moduleLoad > workspaceStyle, "analysis module must mount after its visual layers are ready");
  assert.doesNotMatch(loader, /loadStyle\("analysis-v2-hardening"\)/);
  await assert.rejects(readFile("web/analysis-v2-hardening.css", "utf8"), /ENOENT/);

  assert.match(workspace, /\.a2-shell \{/);
  assert.match(workspace, /max-width: 1440px/);
  assert.match(workspace, /\.a2-tabs \{[\s\S]*position: sticky/);
  assert.match(workspace, /\.a2-tier-list \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /\.a2-ball\.is-strong \{[\s\S]*background: var\(--accent-soft\)/);
  assert.match(workspace, /\.a2-shell \.positive \{[\s\S]*color: var\(--success-strong\)/);
  assert.match(workspace, /\.a2-filter-numbers \{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /\.a2-detail \{[\s\S]*position: fixed[\s\S]*height: 100dvh[\s\S]*overflow-y: auto/);
  assert.match(workspace, /\.a2-detail:not\(\[open\]\) \{[\s\S]*display: none/);
  assert.match(workspace, /\.a2-detail::backdrop \{[\s\S]*backdrop-filter: blur\(2px\)/);
  assert.match(workspace, /@media \(max-width: 900px\)[\s\S]*\.a2-filter-numbers \{[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /@media \(max-width: 680px\)[\s\S]*\.a2-detail \{[\s\S]*width: 100%[\s\S]*padding: 0 16px 16px/);
  assert.match(workspace, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(workspace, /font-size:\s*(?:[0-9]|1[0-5])px/);

  assert.match(analysis, /const TABS = \["ranking", "structure", "dynamics", "combinations", "validation"\]/);
  assert.match(analysis, /api\(`\/analysis\/\$\{lottery\}\/advanced`\)/);
  assert.match(analysis, /role="tablist"/);
  assert.match(analysis, /<dialog class="a2-detail"/);
  assert.match(analysis, /Atraso e frequência são descrições históricas/);
});
