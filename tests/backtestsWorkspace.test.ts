import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("historical-test workspace has typed canonical ownership with a functional legacy fallback", async () => {
  const [loader, workspace, boundary, source, app, refinements] = await Promise.all([
    readFile("web/feature-loader.js", "utf8"),
    readFile("web/backtests-workspace.css", "utf8"),
    readFile("web/backtests.js", "utf8"),
    readFile("web/src/features/backtests.ts", "utf8"),
    readFile("web/app.js", "utf8"),
    readFile("web/refinements.js", "utf8"),
  ]);

  const refinementsLoad = loader.indexOf('loadStyledModule("refinements")');
  const backtestsBranch = loader.indexOf('if (view === "backtests")');
  const workspaceLoad = loader.indexOf('loadStyle("backtests-workspace")');
  const moduleLoad = loader.indexOf('loadModule("backtests")');
  assert.ok(refinementsLoad >= 0, "shared refinements must remain available as fallback");
  assert.ok(backtestsBranch > refinementsLoad, "historical-test view must preserve its fallback before typed ownership");
  assert.ok(workspaceLoad > backtestsBranch, "Prototype 1 must load before the typed historical-test owner");
  assert.ok(moduleLoad > workspaceLoad, "typed historical-test owner must mount only after its workspace CSS");
  assert.match(loader, /const styleReady = await loadStyle\("backtests-workspace"\);[\s\S]*if \(styleReady\) await loadModule\("backtests"\)/);

  assert.equal(boundary, 'import "./src/features/backtests.js";\n');
  assert.match(source, /from "\.\.\/core\/api\.js"/);
  assert.match(source, /from "\.\.\/core\/viewLifecycle\.js"/);
  assert.match(source, /from "\.\.\/shared\/escaping\.js"/);
  assert.match(source, /from "\.\.\/shared\/formatters\.js"/);
  assert.match(source, /from "\.\.\/shared\/toast\.js"/);
  assert.doesNotMatch(source, /runtime\.js/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /location\.hash/);
  assert.doesNotMatch(source, /addEventListener\("hashchange"/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /isCurrentRender/);
  assert.match(source, /api<BacktestListResponse>\(`\/backtests\/\$\{lottery\}\?limit=20`/);
  assert.match(source, /api<BacktestRun>\("\/backtests\/run"/);
  assert.match(source, /warmupContests: Number\(data\.get\("warmupContests"\)\)/);
  assert.match(source, /persist: data\.get\("persist"\) === "on"/);
  assert.match(source, /Cada concurso é simulado usando somente o histórico disponível antes dele/);
  assert.match(source, /endContest - 99/);
  assert.match(source, /Padrão: últimos 100 concursos/);
  assert.match(source, /data-ui-refined="true"/);
  assert.match(source, /formatCurrency\(summary\.financialCost\)/);
  assert.match(source, /formatCurrency\(summary\.totalPrizeValue\)/);

  assert.match(workspace, /\.stack:has\(#backtest-form\) \{[\s\S]*max-width: 1440px/);
  assert.match(workspace, /#backtest-form \.form-grid \{[\s\S]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /#backtest-form \.button\.primary \{[\s\S]*background: var\(--accent\)/);
  assert.match(workspace, /#backtest-result \.metric-value\.positive \{[\s\S]*color: var\(--success-strong\)/);
  assert.match(workspace, /#backtest-result \.metric-value\.negative \{[\s\S]*color: var\(--danger\)/);
  assert.match(workspace, /@media \(max-width: 620px\)[\s\S]*#backtest-form \.form-grid \{[\s\S]*grid-template-columns: 1fr/);
  assert.match(workspace, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(workspace, /font-size:\s*(?:[0-9]|1[0-5])px/);

  // The current slice keeps the pre-TypeScript implementation as an explicit
  // functional fallback. A later #60 slice may remove it after the typed owner
  // has proven stable, but it must not become canonical again.
  assert.match(app, /api\(`\/backtests\/\$\{render\.lottery\}\?limit=20`/);
  assert.match(app, /api\("\/backtests\/run", \{ method: "POST"/);
  assert.match(refinements, /function refineBacktests\(\)/);
});
