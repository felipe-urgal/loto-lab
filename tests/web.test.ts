import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { createLotoLabServer } from "../src/api/server.js";

test("web application shell and assets are served by the Loto Lab process", async (t) => {
  const server = createLotoLabServer({ pool: {} as Pool });
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
  assert.match(html, /\/assets\/app\.js/);

  const javascript = await fetch(`${baseUrl}/assets/app.js`);
  assert.equal(javascript.status, 200);
  assert.match(javascript.headers.get("content-type") ?? "", /^text\/javascript/);
  const source = await javascript.text();
  assert.match(source, /\/api\/v1/);
  assert.match(source, /games\/generate/);
  assert.match(source, /backtests\/run/);

  const stylesheet = await fetch(`${baseUrl}/assets/styles.css`);
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get("content-type") ?? "", /^text\/css/);
  assert.match(await stylesheet.text(), /\.app-shell/);
});
