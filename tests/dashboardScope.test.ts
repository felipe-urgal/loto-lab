import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("dashboard centralizes results, saved games, pending checks and data recovery", async () => {
  const [
    boundary,
    scopeSource,
    typesSource,
    loaderSource,
    statusSource,
    scopeCss,
    apiSource,
  ] = await Promise.all([
    readFile("web/dashboard-scope.js", "utf8"),
    readFile("web/src/features/dashboardScope.ts", "utf8"),
    readFile("web/src/features/dashboardScope/types.ts", "utf8"),
    readFile("web/src/core/featureLoader.ts", "utf8"),
    readFile("web/src/features/dataStatus.ts", "utf8"),
    readFile("web/dashboard-scope.css", "utf8"),
    readFile("src/api/app.ts", "utf8"),
  ]);

  assert.equal(boundary, 'import "./src/features/dashboardScope.js";\n');
  assert.match(scopeSource, /from "\.\.\/core\/api\.js"/);
  assert.match(scopeSource, /from "\.\.\/core\/viewLifecycle\.js"/);
  assert.match(scopeSource, /from "\.\.\/shared\/escaping\.js"/);
  assert.match(scopeSource, /from "\.\.\/shared\/formatters\.js"/);
  assert.match(scopeSource, /from "\.\.\/shared\/toast\.js"/);
  assert.doesNotMatch(scopeSource, /location\.hash\.replace/);
  assert.doesNotMatch(scopeSource, /addEventListener\("hashchange"/);
  assert.match(scopeSource, /currentMainView\(\)/);
  assert.match(scopeSource, /onMainViewChanged/);
  assert.match(scopeSource, /onViewRendered/);
  assert.match(scopeSource, /loadController\?\.abort\(\)/);
  assert.match(scopeSource, /controller\.signal\.aborted/);

  assert.match(typesSource, /"mais-milionaria": "\+Milionária"/);
  assert.match(typesSource, /"super-sete": "Super Sete"/);
  assert.match(typesSource, /export type LotteryCapabilitiesDto/);
  assert.match(typesSource, /export type RealBetDto/);
  assert.match(typesSource, /batchId\?: unknown/);

  assert.match(scopeSource, /\/lotteries/);
  assert.match(scopeSource, /\/contests\/\$\{lottery\}\?limit=5/);
  assert.match(scopeSource, /\/real-bets\/\$\{lottery\}\?limit=50/);
  assert.match(scopeSource, /\/game-batches\/\$\{lottery\}\?limit=5/);
  assert.doesNotMatch(scopeSource, /\/backtests\//);
  assert.doesNotMatch(scopeSource, /ROI histórico|Melhor ROI|Desempenho por loteria/);

  assert.match(scopeSource, /function hero/);
  assert.match(scopeSource, /function savedGames/);
  assert.match(scopeSource, /function recentResults/);
  assert.match(scopeSource, /function pendingSection/);
  assert.match(scopeSource, /Jogos salvos/);
  assert.match(scopeSource, /Resultados recentes/);
  assert.match(scopeSource, /Pendências/);
  assert.match(scopeSource, /data-dashboard-check-bet/);
  assert.match(scopeSource, /\/real-bets\/\$\{betId\}\/check/);
  assert.match(scopeSource, /supports\(catalog, lottery, "simulation"\)/);
  assert.match(scopeSource, /supports\(catalog, lottery, "analysis"\)/);
  assert.match(scopeSource, /supports\(catalog, lottery, "checking"\)/);

  const scopeLoad = loaderSource.indexOf('loadStyledModule("dashboard-scope")');
  const statusLoad = loaderSource.indexOf('loadModule("data-status")');
  assert.ok(scopeLoad >= 0, "dashboard scope module must be lazy-loaded");
  assert.ok(statusLoad > scopeLoad, "dashboard scope must load before operational status");
  assert.doesNotMatch(loaderSource, /my-games-v2|backtests-workspace|loadModule\("backtests"\)/);

  assert.match(statusSource, /Dados precisam de atenção/);
  assert.match(statusSource, /data-status-refresh/);
  assert.match(statusSource, /refreshButton\?\.click\(\)/);
  assert.match(statusSource, /isLotteryId, type LotteryId/);
  assert.match(statusSource, /continuidade indisponível/);
  assert.match(statusSource, /último concurso indisponível/);
  assert.doesNotMatch(statusSource, /Number\(item\.lastContest\) \|\| 0/);

  assert.match(apiSource, /getLotteryCatalogEntry/);
  assert.match(apiSource, /capabilities: catalog\.capabilities/);
  assert.match(apiSource, /family: catalog\.family/);

  assert.match(scopeCss, /\.dashboard-hero/);
  assert.match(scopeCss, /\.dashboard-summary/);
  assert.match(scopeCss, /\.dashboard-columns/);
  assert.match(scopeCss, /\.dashboard-game-row/);
  assert.match(scopeCss, /\.dashboard-result-row/);
  assert.match(scopeCss, /\.data-status-action/);
  assert.match(scopeCss, /@media \(max-width: 680px\)/);
});
