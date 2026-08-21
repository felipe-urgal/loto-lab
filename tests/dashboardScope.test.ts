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
  assert.match(scopeSource, /loadAllDashboardData/);
  assert.match(scopeSource, /\/backtests\/\$\{lottery\}\?limit=1/);
  assert.match(scopeSource, /\/real-bets\/\$\{lottery\}\?limit=50/);
  assert.match(scopeSource, /\/game-batches\/\$\{lottery\}\?limit=3/);
  assert.match(scopeSource, /Dashboard · \$\{LOTTERIES\[scope\]\}/);
  assert.match(scopeSource, /navigatingFromDashboard/);
  assert.match(scopeSource, /const previousScope = savedScope\(\)/);
  assert.match(scopeSource, /localStorage\.setItem\(DASHBOARD_SCOPE_KEY, previousScope\)/);

  const scopeLoad = loaderSource.indexOf('loadStyledModule("dashboard-scope")');
  const statusLoad = loaderSource.indexOf('loadStyledModule("data-status")');
  assert.ok(scopeLoad >= 0, "dashboard scope module must be lazy-loaded");
  assert.ok(statusLoad > scopeLoad, "dashboard scope must load before operational status");

  assert.match(statusSource, /scope === "all" \|\| item\.lottery === scope/);
  assert.match(statusSource, /data-status-shell \$\{scope === "all" \? "" : "is-focused"\}/);
  assert.match(scopeCss, /dashboard-comparison-grid/);
  assert.match(scopeCss, /dashboard-focus-section/);
  assert.match(statusCss, /data-status-shell\.is-focused/);
});
