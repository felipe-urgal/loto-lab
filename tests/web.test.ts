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

  for (const route of ["/lab", "/ai", "/agenda"]) {
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
  assert.match(shellSource, /Backtests/);
  assert.match(shellSource, /Laboratório/);
  assert.match(shellSource, /Agenda/);

  const loader = await fetch(`${baseUrl}/assets/feature-loader.js`);
  assert.equal(loader.status, 200);
  const loaderSource = await loader.text();
  assert.match(loaderSource, /import\(asset/);
  assert.match(loaderSource, /generation-diversity/);
  assert.match(loaderSource, /my-games-management/);

  const javascript = await fetch(`${baseUrl}/assets/app.js?v=test`);
  assert.equal(javascript.status, 200);
  assert.match(javascript.headers.get("content-type") ?? "", /^text\/javascript/);
  assert.match(javascript.headers.get("cache-control") ?? "", /immutable/);
  const source = await javascript.text();
  assert.match(source, /\/api\/v1/);
  assert.match(source, /games\/generate/);
  assert.match(source, /backtests\/run/);

  for (const asset of [
    "real-bets.js",
    "generation-diversity.js",
    "my-games-management.js",
    "lab.js",
    "data-status.js",
    "styles.css",
    "refinements.css",
    "lab.css",
    "data-status.css",
  ]) {
    const response = await fetch(`${baseUrl}/assets/${asset}`);
    assert.equal(response.status, 200, asset);
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
