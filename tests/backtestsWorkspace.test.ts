import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("historical-test workspace follows Prototype 1 while preserving execution contracts", async () => {
  const [loader, workspace, app, refinements] = await Promise.all([
    readFile("web/feature-loader.js", "utf8"),
    readFile("web/backtests-workspace.css", "utf8"),
    readFile("web/app.js", "utf8"),
    readFile("web/refinements.js", "utf8"),
  ]);

  const refinementsLoad = loader.indexOf('loadStyledModule("refinements")');
  const backtestsBranch = loader.indexOf('if (view === "backtests")');
  const workspaceLoad = loader.indexOf('loadStyle("backtests-workspace")');
  assert.ok(refinementsLoad >= 0, "shared refinements must remain available");
  assert.ok(backtestsBranch > refinementsLoad, "historical-test view must refine before final presentation");
  assert.ok(workspaceLoad > backtestsBranch, "Prototype 1 must be the final historical-test style layer");

  assert.match(workspace, /\.stack:has\(#backtest-form\) \{[\s\S]*max-width: 1440px/);
  assert.match(workspace, /#backtest-form \.form-grid \{[\s\S]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /#backtest-form \.button\.primary \{[\s\S]*background: var\(--accent\)/);
  assert.match(workspace, /#backtest-result \.metric-value\.positive \{[\s\S]*color: var\(--success-strong\)/);
  assert.match(workspace, /#backtest-result \.metric-value\.negative \{[\s\S]*color: var\(--danger\)/);
  assert.match(workspace, /@media \(max-width: 620px\)[\s\S]*#backtest-form \.form-grid \{[\s\S]*grid-template-columns: 1fr/);
  assert.match(workspace, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(workspace, /font-size:\s*(?:[0-9]|1[0-5])px/);

  assert.match(app, /api\(`\/backtests\/\$\{render\.lottery\}\?limit=20`/);
  assert.match(app, /api\("\/backtests\/run", \{ method: "POST"/);
  assert.match(app, /warmupContests: Number\(data\.get\("warmupContests"\)\)/);
  assert.match(app, /persist: data\.get\("persist"\) === "on"/);
  assert.match(app, /Cada concurso é simulado usando somente o histórico disponível antes dele/);

  assert.match(refinements, /function refineBacktests\(\)/);
  assert.match(refinements, /endNumber - 99/);
  assert.match(refinements, /Padrão: últimos 100 concursos/);
});
