import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { createLotoLabServer } from "../src/api/server.js";

test("agenda legacy route redirects to the Panel while its internal module remains available", async (t) => {
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

  const page = await fetch(`${baseUrl}/agenda`, { redirect: "manual" });
  assert.equal(page.status, 308);
  assert.equal(page.headers.get("location"), "/#dashboard");

  const [boundaryResponse, styles, typedResponse] = await Promise.all([
    fetch(`${baseUrl}/assets/agenda.js`),
    fetch(`${baseUrl}/assets/agenda-workspace.css`),
    fetch(`${baseUrl}/assets/src/features/agenda.js`),
  ]);
  assert.equal(boundaryResponse.status, 404);
  assert.equal(styles.status, 404);
  assert.equal(typedResponse.status, 200);

  const typedSource = await typedResponse.text();
  assert.match(typedSource, /notifications\/read-all/);
  assert.match(typedSource, /data-read-notification/);
  assert.match(typedSource, /\.\.\/core\/api\.js/);
  assert.doesNotMatch(typedSource, /fetch\(`\/api\/v1\/agenda/);
});
