import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { createLotoLabServer } from "../src/api/server.js";

test("web application shell, Strategy Lab and assets are served by the Loto Lab process", async (t) => {
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
  const html = await page.text();
  assert.match(html, /Loto Lab/);
  assert.match(html, /Dashboard/);
  assert.match(html, /Gerar jogos/);
  assert.match(html, /Laboratório/);
  assert.match(html, /data-status-bar/);
  assert.match(html, /\/assets\/app\.js/);
  assert.match(html, /\/assets\/data-status\.js/);
  assert.match(html, /\/assets\/real-bets\.js/);
  assert.match(html, /\/assets\/real-bets\.css/);
  assert.match(html, /\/assets\/generation-diversity\.js/);
  assert.match(html, /\/assets\/generation-diversity\.css/);

  const labPage = await fetch(`${baseUrl}/lab`);
  assert.equal(labPage.status, 200);
  assert.match(labPage.headers.get("content-type") ?? "", /^text\/html/);
  const labHtml = await labPage.text();
  assert.match(labHtml, /Laboratório/);
  assert.match(labHtml, /Executar comparação/);
  assert.match(labHtml, /\/assets\/lab\.js/);
  assert.match(labHtml, /\/assets\/lab\.css/);

  const javascript = await fetch(`${baseUrl}/assets/app.js`);
  assert.equal(javascript.status, 200);
  assert.match(javascript.headers.get("content-type") ?? "", /^text\/javascript/);
  const source = await javascript.text();
  assert.match(source, /\/api\/v1/);
  assert.match(source, /games\/generate/);
  assert.match(source, /backtests\/run/);

  const realBetsJavascript = await fetch(`${baseUrl}/assets/real-bets.js`);
  assert.equal(realBetsJavascript.status, 200);
  assert.match(realBetsJavascript.headers.get("content-type") ?? "", /^text\/javascript/);
  const realBetSource = await realBetsJavascript.text();
  assert.match(realBetSource, /real-bets/);
  assert.match(realBetSource, /Marcar como apostado/);
  assert.match(realBetSource, /Desempenho real/);

  const realBetStyles = await fetch(`${baseUrl}/assets/real-bets.css`);
  assert.equal(realBetStyles.status, 200);
  assert.match(await realBetStyles.text(), /\.real-bet-status/);

  const diversityJavascript = await fetch(`${baseUrl}/assets/generation-diversity.js`);
  assert.equal(diversityJavascript.status, 200);
  assert.match(diversityJavascript.headers.get("content-type") ?? "", /^text\/javascript/);
  const diversitySource = await diversityJavascript.text();
  assert.match(diversitySource, /Modo real · diversificado/);
  assert.match(diversitySource, /generatorOptions/);

  const diversityStyles = await fetch(`${baseUrl}/assets/generation-diversity.css`);
  assert.equal(diversityStyles.status, 200);
  assert.match(await diversityStyles.text(), /\.generation-mode-card/);

  const labJavascript = await fetch(`${baseUrl}/assets/lab.js`);
  assert.equal(labJavascript.status, 200);
  assert.match(labJavascript.headers.get("content-type") ?? "", /^text\/javascript/);
  assert.match(await labJavascript.text(), /lab\/compare/);

  const dataStatusJavascript = await fetch(`${baseUrl}/assets/data-status.js`);
  assert.equal(dataStatusJavascript.status, 200);
  assert.match(await dataStatusJavascript.text(), /data\/status/);

  const stylesheet = await fetch(`${baseUrl}/assets/styles.css`);
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get("content-type") ?? "", /^text\/css/);
  assert.match(await stylesheet.text(), /\.app-shell/);

  const labStyles = await fetch(`${baseUrl}/assets/lab.css`);
  assert.equal(labStyles.status, 200);
  assert.match(await labStyles.text(), /\.lab-ranking/);

  const dataStatusStyles = await fetch(`${baseUrl}/assets/data-status.css`);
  assert.equal(dataStatusStyles.status, 200);
  assert.match(await dataStatusStyles.text(), /\.data-status-bar/);

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
