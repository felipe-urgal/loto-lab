import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("dashboard scope keeps comparison mode separate from the active lottery", async () => {
  const [scopeSource, loaderSource, statusSource, scopeCss, statusCss] = await Promise.all([
    readFile("web/dashboard-scope.js", "utf8"),
    readFile("web/feature-loader.js", "utf8"),
    readFile("web/data-status.js", "utf8"),
    readFile("web/dashboard-scope.css", "utf8"),
    readFile("web/data-status.css", "utf8"),
  ]);

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
  const statusLoad = loaderSource.indexOf('loadStyledModule("data-status")');
  assert.ok(scopeLoad >= 0, "dashboard scope module must be lazy-loaded");
  assert.ok(statusLoad > scopeLoad, "dashboard scope must load before operational status");

  assert.match(statusSource, /scope === "all" \|\| item\.lottery === scope/);
  assert.match(statusSource, /data-status-compact/);
  assert.match(statusSource, /Sincronização em andamento/);
  assert.doesNotMatch(statusSource, /cobertura média/);
  assert.doesNotMatch(statusSource, /Sincronizar agora/);

  assert.match(scopeSource, /function focusedMetrics/);
  assert.match(scopeSource, /function allMetrics/);
  assert.match(scopeSource, /function realStatusCard/);
  assert.match(scopeSource, /actualCost > 0 \? netResult \/ actualCost : undefined/);
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
  assert.match(statusCss, /data-status-compact/);
});
