import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { createLotoLabServer } from "../src/api/server.js";

async function startServer(t: TestContext): Promise<string> {
  const pool = {
    async query() {
      return { rows: [] };
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
  return `http://127.0.0.1:${(address as AddressInfo).port}`;
}

test("built web assets support HEAD and missing assets are never cached", async (t) => {
  const baseUrl = await startServer(t);
  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  const html = await page.text();
  const version = html.match(/data-build="([a-f0-9]{12})"/)?.[1];
  assert.ok(version);

  const head = await fetch(`${baseUrl}/assets/app.js?v=${version}`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.match(head.headers.get("content-type") ?? "", /^text\/javascript/);
  assert.match(head.headers.get("cache-control") ?? "", /immutable/);
  assert.ok(Number(head.headers.get("content-length")) > 0);
  assert.equal(await head.text(), "");

  const missing = await fetch(`${baseUrl}/assets/does-not-exist.js`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("cache-control"), "no-store");
});

test("built HTML carries one build version and versioned first-party assets", async (t) => {
  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  const versions = [...html.matchAll(/data-build="([a-f0-9]{12})"/g)].map((match) => match[1]);
  assert.equal(versions.length, 1);
  const version = versions[0]!;

  const assetUrls = [...html.matchAll(/(?:src|href)="(\/(?:assets\/[^"?#]+|favicon\.svg)[^"]*)"/g)]
    .map((match) => match[1]);
  assert.ok(assetUrls.length >= 4);
  assert.ok(assetUrls.every((url) => url.endsWith(`?v=${version}`)));
});

test("frontend hardening guards stale state, async races and duplicate refinements", async (t) => {
  const baseUrl = await startServer(t);
  const fetchSource = async (name: string) => {
    const response = await fetch(`${baseUrl}/assets/${name}`);
    assert.equal(response.status, 200, name);
    return response.text();
  };

  const [app, shellBoundary, shell, refinements, myGames, presentation, auditability, agenda, strategies, jobs, foundation] = await Promise.all([
    fetchSource("app.js"),
    fetchSource("shell.js"),
    fetchSource("src/core/shell.js"),
    fetchSource("refinements.js"),
    fetchSource("src/features/myGames.js"),
    fetchSource("src/features/myGames/presentation.js"),
    fetchSource("src/features/myGames/auditability.js"),
    fetchSource("src/features/agenda.js"),
    fetchSource("src/features/strategies.js"),
    fetchSource("src/features/jobs.js"),
    fetchSource("ui-foundation.css"),
  ]);

  assert.match(app, /function sumKnownMoney\(items, field\)/);
  assert.match(app, /const prize = sumKnownMoney\(result\.checks, "totalPrizeValue"\)/);
  assert.match(app, /const cost = sumKnownMoney\(result\.checks, "ticketCost"\)/);
  assert.match(app, /const net = prize !== undefined && cost !== undefined \? prize - cost : undefined/);
  assert.match(app, /formatCurrency\(check\.totalPrizeValue\)/);
  assert.doesNotMatch(app, /check\.totalPrizeValue \|\| 0/);
  assert.doesNotMatch(app, /check\.ticketCost \|\| 0/);

  assert.match(shellBoundary, /\.\/src\/core\/shell\.js/);
  assert.match(shell, /normalizeMainHash/);
  assert.match(shell, /localStorage\.removeItem\("loto-lab:lottery"\)/);
  assert.match(shell, /matchMedia\("\(max-width: 680px\)"\)/);

  assert.match(refinements, /analysisRefined === "loading"/);
  assert.match(refinements, /latestCache\.delete/);
  assert.match(refinements, /loto-lab:data-synced/);

  assert.match(myGames, /requestToken/);
  assert.match(myGames, /token !== ui\.requestToken/);
  assert.match(myGames, /currentMainView\(\) !== "games"/);
  assert.match(myGames, /refresh-view/);
  assert.match(myGames, /loto-lab:data-synced/);
  assert.match(presentation, /aria-pressed=/);
  assert.match(presentation, /aria-expanded=/);
  assert.match(auditability, /readOnly = true/);
  assert.match(auditability, /auditTargetContest/);
  assert.match(auditability, /stopImmediatePropagation\(\)/);
  assert.doesNotMatch(auditability, /MutationObserver|document\.addEventListener/);

  assert.match(agenda, /new AbortController\(\)/);
  assert.match(agenda, /loadToken/);
  assert.match(agenda, /safeActionHref/);
  assert.match(agenda, /new URL\(value, location\.origin\)/);
  assert.match(agenda, /aria-pressed/);

  assert.match(strategies, /let loadToken = 0/);
  assert.match(strategies, /const requestedFilter = filter\.value/);
  assert.match(strategies, /token !== loadToken \|\| filter\.value !== requestedFilter/);

  assert.match(jobs, /let strategyLoadToken = 0/);
  assert.match(jobs, /token !== strategyLoadToken \|\| lottery\.value !== requestedLottery/);
  assert.match(jobs, /token !== loadToken \|\| lottery\.value !== requestedLottery/);
  assert.match(jobs, /Promise\.all\(\[loadStrategies\(\), loadJobs\(\)\]\)/);

  assert.match(foundation, /\.nav-item \.nav-label/);
  assert.match(foundation, /safe-area-inset-bottom/);
});
