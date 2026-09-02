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
  assert.match(html, /\/assets\/agenda-workspace\.css/);
  assert.doesNotMatch(html, /\/assets\/agenda\.css/);

  const styles = await fetch(`${baseUrl}/assets/agenda-workspace.css`);
  assert.equal(styles.status, 200);
  const css = await styles.text();
  assert.match(css, /\.main-nav a\.nav-item/);
  assert.match(css, /text-decoration:\s*none\s*!important/);

  const legacyStyles = await fetch(`${baseUrl}/assets/agenda.css`);
  assert.equal(legacyStyles.status, 404);

  const [boundaryResponse, typedResponse] = await Promise.all([
    fetch(`${baseUrl}/assets/agenda.js`),
    fetch(`${baseUrl}/assets/src/features/agenda.js`),
  ]);
  assert.equal(boundaryResponse.status, 200);
  assert.equal(typedResponse.status, 200);

  const [boundarySource, typedSource] = await Promise.all([
    boundaryResponse.text(),
    typedResponse.text(),
  ]);
  assert.match(boundarySource, /\.\/src\/features\/agenda\.js/);
  assert.match(typedSource, /notifications\/read-all/);
  assert.match(typedSource, /data-read-notification/);
  assert.match(typedSource, /\.\.\/core\/api\.js/);
  assert.doesNotMatch(typedSource, /fetch\(`\/api\/v1\/agenda/);
});
