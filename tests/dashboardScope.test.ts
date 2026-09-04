import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("dashboard scope keeps comparison mode separate from the active lottery", async () => {
  const [
    boundary,
    scopeSource,
    financialSource,
    typesSource,
    loaderSource,
    statusSource,
    scopeCss,
  ] = await Promise.all([
    readFile("web/dashboard-scope.js", "utf8"),
    readFile("web/src/features/dashboardScope.ts", "utf8"),
    readFile("web/src/features/dashboardScope/financial.ts", "utf8"),
    readFile("web/src/features/dashboardScope/types.ts", "utf8"),
    readFile("web/src/core/featureLoader.ts", "utf8"),
    readFile("web/src/features/dataStatus.ts", "utf8"),
    readFile("web/dashboard-scope.css", "utf8"),
  ]);

  assert.equal(boundary, 'import "./src/features/dashboardScope.js";\n');
  assert.match(scopeSource, /from "\.\.\/core\/api\.js"/);
  assert.match(scopeSource, /from "\.\.\/core\/viewLifecycle\.js"/);
  assert.match(scopeSource, /from "\.\.\/shared\/escaping\.js"/);
  assert.match(scopeSource, /from "\.\.\/shared\/formatters\.js"/);
  assert.match(scopeSource, /from "\.\.\/shared\/toast\.js"/);
  assert.doesNotMatch(scopeSource, /from "\.\/runtime\.js"/);
  assert.doesNotMatch(scopeSource, /location\.hash\.replace/);
  assert.doesNotMatch(scopeSource, /addEventListener\("hashchange"/);
  assert.match(scopeSource, /currentMainView\(\)/);
  assert.match(scopeSource, /onMainViewChanged/);
  assert.match(scopeSource, /onViewRendered/);
  assert.match(scopeSource, /loadController\?\.abort\(\)/);
  assert.match(scopeSource, /controller\.signal\.aborted/);

  assert.match(typesSource, /export type DashboardScope = "all" \| LotteryId/);
  assert.match(typesSource, /export type RealBetSummaryDto/);
  assert.match(typesSource, /checkedCost\?: unknown/);
  assert.match(typesSource, /netResult\?: unknown/);

  assert.match(scopeSource, /loto-lab:dashboard-scope/);
  assert.match(scopeSource, /option\.value = "all"/);
  assert.match(scopeSource, /Todas as loterias/);
  assert.match(scopeSource, /selectLabel\.textContent = "Escopo"/);
  assert.match(scopeSource, /selectLabel\.textContent = "Loteria"/);
  assert.match(scopeSource, /localStorage\.getItem\(LOTTERY_KEY\)/);
  assert.match(scopeSource, /loadAllData/);
  assert.match(scopeSource, /loadFocusedData/);
  assert.match(scopeSource, /nextContestNumber/);
  assert.match(scopeSource, /Number\.isFinite\(numeric\) \? numeric \+ 1 : null/);
  assert.match(scopeSource, /\/backtests\/\$\{lottery\}\?limit=1/);
  assert.match(scopeSource, /\/real-bets\/\$\{lottery\}\?limit=50/);
  assert.match(scopeSource, /\/game-batches\/\$\{lottery\}\?limit=3/);
  assert.match(scopeSource, /Painel · \$\{LOTTERIES\[scope\]\}/);
  assert.match(scopeSource, /navigatingFromDashboard/);
  assert.match(scopeSource, /const previousScope = savedScope\(\)/);
  assert.match(scopeSource, /localStorage\.setItem\(DASHBOARD_SCOPE_KEY, previousScope\)/);

  const scopeLoad = loaderSource.indexOf('loadStyledModule("dashboard-scope")');
  const statusLoad = loaderSource.indexOf('loadModule("data-status")');
  assert.ok(scopeLoad >= 0, "dashboard scope module must be lazy-loaded");
  assert.ok(statusLoad > scopeLoad, "dashboard scope must load before operational status");
  assert.doesNotMatch(loaderSource, /loadStyledModule\("data-status"\)/);
  assert.doesNotMatch(loaderSource, /loadStyle\("data-status"\)/);
  await assert.rejects(readFile("web/data-status.css", "utf8"), /ENOENT/);

  assert.match(statusSource, /scope === "all" \|\| item\.lottery === scope/);
  assert.match(statusSource, /data-status-compact/);
  assert.match(statusSource, /Sincronização em andamento/);
  assert.doesNotMatch(statusSource, /cobertura média/);
  assert.doesNotMatch(statusSource, /Sincronizar agora/);

  assert.match(scopeSource, /function focusedMetrics/);
  assert.match(scopeSource, /function allMetrics/);
  assert.match(scopeSource, /function realStatusCard/);
  assert.match(financialSource, /knownNumber\(summary\.checkedCost\)/);
  assert.match(financialSource, /knownNumber\(summary\.netResult\)/);
  assert.match(financialSource, /costs\.every/);
  assert.match(financialSource, /results\.every/);
  assert.match(financialSource, /checkedCost > 0/);
  assert.doesNotMatch(scopeSource, /netResult \|\| 0/);
  assert.doesNotMatch(scopeSource, /actualCost \|\| 0/);
  assert.doesNotMatch(scopeSource, /totalPrizeValue \|\| 0/);
  assert.match(scopeSource, /Custo conferido indisponível/);
  assert.match(scopeSource, /custo conferido/);
  assert.match(scopeSource, /dashboard-metrics-grid/);
  assert.match(scopeSource, /dashboard-overview-grid/);
  assert.match(scopeSource, /dashboard-status-card/);
  assert.match(scopeSource, /dashboard-donut/);
  assert.match(scopeSource, /Desempenho por loteria/);
  assert.match(scopeSource, /Atividade recente/);

  assert.match(scopeCss, /\.dashboard-metrics-grid/);
  assert.match(scopeCss, /\.dashboard-overview-grid/);
  assert.match(scopeCss, /\.dashboard-status-card/);
  assert.match(scopeCss, /conic-gradient\(var\(--success\)/);
  assert.match(scopeCss, /\.dashboard-performance-panel/);
  assert.match(scopeCss, /\.dashboard-lottery-grid/);
  assert.match(scopeCss, /color: var\(--success-strong\)/);
  assert.match(scopeCss, /\.data-status-compact/);
  assert.match(scopeCss, /\.data-status-compact\.is-warning/);
  assert.match(scopeCss, /@media \(max-width: 620px\)[\s\S]*\.data-status-compact/);
});
