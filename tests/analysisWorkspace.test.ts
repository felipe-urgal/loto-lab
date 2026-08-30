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
  const hardeningStyle = loader.indexOf('loadStyle("analysis-v2-hardening")');
  const workspaceStyle = loader.indexOf('loadStyle("analysis-workspace")');
  const moduleLoad = loader.indexOf('loadModule("analysis-v2")');
  assert.ok(baseStyle >= 0, "analysis base style must load");
  assert.ok(hardeningStyle > baseStyle, "analysis hardening must follow the base style");
  assert.ok(workspaceStyle > hardeningStyle, "Prototype 1 workspace must be the final analysis style layer");
  assert.ok(moduleLoad > workspaceStyle, "analysis module must mount after its visual layers are ready");

  assert.match(workspace, /\.a2-shell \{/);
  assert.match(workspace, /max-width: 1440px/);
  assert.match(workspace, /\.a2-tabs \{[\s\S]*position: sticky/);
  assert.match(workspace, /\.a2-tier-list \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /\.a2-ball\.is-strong \{[\s\S]*background: var\(--accent-soft\)/);
  assert.match(workspace, /\.a2-shell \.positive \{[\s\S]*color: var\(--success-strong\)/);
  assert.match(workspace, /@media \(max-width: 680px\)/);
  assert.match(workspace, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(workspace, /font-size:\s*(?:[0-9]|1[0-5])px/);

  assert.match(analysis, /const TABS = \["ranking", "structure", "dynamics", "combinations", "validation"\]/);
  assert.match(analysis, /api\(`\/analysis\/\$\{lottery\}\/advanced`\)/);
  assert.match(analysis, /role="tablist"/);
  assert.match(analysis, /<dialog class="a2-detail"/);
  assert.match(analysis, /Atraso e frequência são descrições históricas/);
});
