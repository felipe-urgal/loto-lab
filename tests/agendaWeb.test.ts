import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { createLotoLabServer } from "../src/api/server.js";

test("agenda notification center is served by the web process", async (t) => {
  const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
  const server = createLotoLabServer({ pool });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

  const page = await fetch(`${baseUrl}/agenda`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Próximos concursos/);
  assert.match(html, /Notificações/);
  assert.match(html, /\/assets\/agenda\.js/);

  const styles = await fetch(`${baseUrl}/assets/agenda.css`);
  assert.equal(styles.status, 200);
  const css = await styles.text();
  assert.match(css, /\.main-nav a\.nav-item/);
  assert.match(css, /text-decoration:\s*none\s*!important/);

  const script = await fetch(`${baseUrl}/assets/agenda.js`);
  assert.equal(script.status, 200);
  const source = await script.text();
  assert.match(source, /\/api\/v1\/agenda/);
  assert.match(source, /notifications\/read-all/);
  assert.match(source, /data-read-notification/);
});
