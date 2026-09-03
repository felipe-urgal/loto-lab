import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { createLotoLabServer } from "../src/api/server.js";

test("web shell, lazy feature assets and cache policy are served by the Loto Lab process", async (t) => {
  const pool = {
    async query() {
      return {
        rows: [{
          contest_count: "10",
          first_contest: 1,
          last_contest: 10,
          financial_contest_count: "8",
          last_updated_at: new Date("2026-08-20T15:00:00.000Z"),
        }],
      };
    },
  } as unknown as Pool;
  const server = createLotoLabServer({ pool });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /^text\/html/);
  assert.equal(page.headers.get("cache-control"), "no-cache");
  const html = await page.text();
  assert.match(html, /Loto Lab/);
  assert.match(html, /data-shell-nav/);
  assert.match(html, /\/assets\/shell\.js/);
  assert.match(html, /\/assets\/feature-loader\.js/);
  assert.match(html, /\/assets\/ui-foundation\.css/);
  assert.doesNotMatch(html, /<script[^>]+data-status\.js/);
  assert.doesNotMatch(html, /<script[^>]+real-bets\.js/);
  const buildVersion = html.match(/\bdata-build="([a-f0-9]{12})"/)?.[1];
  assert.ok(buildVersion);

  for (const route of ["/index.html", "/lab", "/ai", "/agenda"]) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 200);
    const source = await response.text();
    assert.match(source, /data-shell-nav/);
    assert.match(source, /\/assets\/shell\.js/);
  }

  const shell = await fetch(`${baseUrl}/assets/shell.js`);
  assert.equal(shell.status, 200);
  const shellSource = await shell.text();
  assert.match(shellSource, /nav-more/);
  assert.match(shellSource, /Testes históricos/);
  assert.match(shellSource, /Laboratório/);
  assert.match(shellSource, /Agenda/);
  assert.match(shellSource, /aria-label="\$\{item\.label\}"/);
  assert.match(shellSource, /aria-label="Mais opções"/);
  assert.match(shellSource, /aria-controls="nav-more-panel"/);
  assert.match(shellSource, /data-agenda-nav-badge/);
  assert.doesNotMatch(shellSource, /role="menu"/);

  const loader = await fetch(`${baseUrl}/assets/feature-loader.js`);
  assert.equal(loader.status, 200);
  const loaderSource = await loader.text();
  assert.match(loaderSource, /import\(asset/);
  assert.match(loaderSource, /generation-v2/);
  assert.doesNotMatch(loaderSource, /loadStyledModule\("generation-diversity"\)/);
  assert.match(loaderSource, /my-games-v2/);
  assert.match(loaderSource, /my-games-management/);
  assert.match(loaderSource, /backtests-workspace/);
  assert.match(loaderSource, /loadModule\("backtests"\)/);
  assert.match(loaderSource, /styleLoads/);
  assert.match(loaderSource, /loadStyledModule/);
  assert.match(loaderSource, /addEventListener\("load"/);
  assert.match(loaderSource, /loadModule\("data-status"\)/);
  assert.doesNotMatch(loaderSource, /loadStyledModule\("data-status"\)/);

  const javascript = await fetch(`${baseUrl}/assets/app.js?v=${buildVersion}`);
  assert.equal(javascript.status, 200);
  assert.match(javascript.headers.get("content-type") ?? "", /^text\/javascript/);
  assert.match(javascript.headers.get("cache-control") ?? "", /immutable/);
  const source = await javascript.text();
  assert.match(source, /\/api\/v1/);
  assert.match(source, /games\/generate/);
  assert.match(source, /data-feature-owned="backtests"/);
  assert.doesNotMatch(source, /backtests\/run/);

  const backtestsBoundary = await fetch(`${baseUrl}/assets/backtests.js`);
  assert.equal(backtestsBoundary.status, 200);
  assert.match(await backtestsBoundary.text(), /src\/features\/backtests\.js/);

  const typedBacktests = await fetch(`${baseUrl}/assets/src/features/backtests.js`);
  assert.equal(typedBacktests.status, 200);
  const typedBacktestsSource = await typedBacktests.text();
  assert.match(typedBacktestsSource, /backtests\/run/);
  assert.match(typedBacktestsSource, /currentMainView/);

  const invalidVersion = await fetch(`${baseUrl}/assets/app.js?v=stale-build`);
  assert.equal(invalidVersion.status, 200);
  assert.equal(invalidVersion.headers.get("cache-control"), "no-store");

  const unversionedJavascript = await fetch(`${baseUrl}/assets/app.js`);
  assert.equal(unversionedJavascript.status, 200);
  assert.match(unversionedJavascript.headers.get("cache-control") ?? "", /max-age=300/);

  for (const asset of [
    "real-bets.js",
    "generation-v2.js",
    "generation-v2.css",
    "my-games-v2.js",
    "my-games-v2.css",
    "my-games-management.js",
    "lab.js",
    "data-status.js",
    "src/features/dataStatus.js",
    "backtests.js",
    "src/features/backtests.js",
    "styles.css",
    "refinements.css",
    "lab-workspace.css",
    "dashboard-scope.css",
  ]) {
    const response = await fetch(`${baseUrl}/assets/${asset}`);
    assert.equal(response.status, 200, asset);
  }

  const dataStatusBoundary = await fetch(`${baseUrl}/assets/data-status.js`);
  assert.equal(dataStatusBoundary.status, 200);
  assert.match(await dataStatusBoundary.text(), /\.\/src\/features\/dataStatus\.js/);

  const typedDataStatus = await fetch(`${baseUrl}/assets/src/features/dataStatus.js`);
  assert.equal(typedDataStatus.status, 200);
  const typedDataStatusSource = await typedDataStatus.text();
  assert.match(typedDataStatusSource, /currentMainView/);
  assert.doesNotMatch(typedDataStatusSource, /location\.hash/);

  for (const removedAsset of ["lab.css", "lab-v2.css", "data-status.css"]) {
    const response = await fetch(`${baseUrl}/assets/${removedAsset}`);
    assert.equal(response.status, 404, removedAsset);
  }

  const foundation = await fetch(`${baseUrl}/assets/ui-foundation.css`);
  assert.equal(foundation.status, 200);
  const foundationSource = await foundation.text();
  assert.match(foundationSource, /:focus-visible/);
  assert.match(foundationSource, /prefers-reduced-motion/);
  assert.match(foundationSource, /nav-more-menu/);

  const status = await fetch(`${baseUrl}/api/v1/data/status`);
  assert.equal(status.status, 200);
  const payload = (await status.json()) as {
    items: Array<{ contestCount: number; missingContestCount: number; financialCoverage: number }>;
  };
  assert.equal(payload.items.length, 3);
  assert.ok(payload.items.every((item) => item.contestCount === 10));
  assert.ok(payload.items.every((item) => item.missingContestCount === 0));
  assert.ok(payload.items.every((item) => item.financialCoverage === 0.8));
});
