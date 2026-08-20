import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { createLotoLabServer } from "../src/api/server.js";

test("dashboard operational controls are served by the web process", async (t) => {
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

  const response = await fetch(`${baseUrl}/assets/data-status.js`);
  assert.equal(response.status, 200);
  const source = await response.text();
  assert.match(source, /\/api\/v1\/operations\/status/);
  assert.match(source, /\/api\/v1\/operations\/sync/);
  assert.match(source, /Sincronizar agora/);
});
