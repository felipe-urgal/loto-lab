import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("analysis workspace follows Redesign V2 single-map contract without changing statistical ownership", async () => {
  const [loader, workspace, boundary, analysis] = await Promise.all([
    readFile("web/src/core/featureLoader.ts", "utf8"),
    readFile("web/analysis-workspace.css", "utf8"),
    readFile("web/analysis-v2.js", "utf8"),
    readFile("web/src/features/analysisV2.ts", "utf8"),
  ]);

  const baseStyle = loader.indexOf('loadStyle("analysis-v2")');
  const workspaceStyle = loader.indexOf('loadStyle("analysis-workspace")');
  const moduleLoad = loader.indexOf('loadModule("analysis-v2")');
  assert.ok(baseStyle >= 0, "analysis base style must load");
  assert.ok(workspaceStyle > baseStyle, "Redesign V2 workspace must be the final analysis style layer");
  assert.ok(moduleLoad > workspaceStyle, "analysis module must mount after its visual layers are ready");
  assert.doesNotMatch(loader, /loadStyle\("analysis-v2-hardening"\)/);
  await assert.rejects(readFile("web/analysis-v2-hardening.css", "utf8"), /ENOENT/);

  assert.equal(
    boundary,
    'import "./src/features/analysisV2.js";\nimport "./src/features/analysisV2/journey.js";\n',
  );
  assert.match(analysis, /currentMainView/);
  assert.match(analysis, /onMainViewChanged/);
  assert.doesNotMatch(analysis, /runtime\.js/);

  assert.match(workspace, /\.a2-shell \{[\s\S]*max-width: var\(--content-max-width\)/);
  assert.match(workspace, /\.a2-number-map \{[\s\S]*repeat\(auto-fill, minmax\(66px, 1fr\)\)/);
  assert.match(workspace, /\.a2-map-number\.is-strong/);
  assert.match(workspace, /\.a2-map-number\.is-balanced/);
  assert.match(workspace, /\.a2-map-number\.is-cold/);
  assert.match(workspace, /\.a2-technical-block > summary/);
  assert.match(workspace, /\.a2-detail \{[\s\S]*position: fixed[\s\S]*height: 100dvh[\s\S]*overflow-y: auto/);
  assert.match(workspace, /\.a2-detail:not\(\[open\]\) \{[\s\S]*display: none/);
  assert.match(workspace, /\.a2-detail::backdrop \{[\s\S]*backdrop-filter: blur\(2px\)/);
  assert.match(workspace, /@media \(max-width: 680px\)[\s\S]*\.a2-number-map \{[\s\S]*repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(workspace, /font-size:\s*(?:[0-9]|1[0-5])px/);

  assert.match(analysis, /Mapa das dezenas/);
  assert.match(analysis, /data-a2-number-map/);
  assert.match(analysis, /data-a2-map-filter/);
  assert.match(analysis, /Comparar dezenas/);
  assert.match(analysis, /Indicadores e metodologia/);
  assert.match(analysis, /detailsBlock\("Estrutura e distribuições"/);
  assert.match(analysis, /detailsBlock\("Dinâmica histórica"/);
  assert.match(analysis, /detailsBlock\("Associações"/);
  assert.match(analysis, /detailsBlock\("Auditoria de aleatoriedade"/);
  assert.match(analysis, /detailsBlock\("Validação e metodologia"/);
  assert.match(analysis, /api<LotteryCatalogPayload>\("\/lotteries"\)/);
  assert.match(analysis, /FLAT_NUMBER_FAMILIES/);
  assert.doesNotMatch(analysis, /role="tablist"|data-a2-tab|ACTIVE_TAB_KEY/);
  assert.match(analysis, /<dialog class="a2-detail"/);
  assert.match(analysis, /Atraso e frequência são descrições históricas/);
});
