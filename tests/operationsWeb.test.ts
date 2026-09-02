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

  const [statusBoundaryResponse, typedStatusResponse, dashboardResponse] = await Promise.all([
    fetch(`${baseUrl}/assets/data-status.js`),
    fetch(`${baseUrl}/assets/src/features/dataStatus.js`),
    fetch(`${baseUrl}/assets/dashboard-scope.js`),
  ]);
  assert.equal(statusBoundaryResponse.status, 200);
  assert.equal(typedStatusResponse.status, 200);
  assert.equal(dashboardResponse.status, 200);

  const [statusBoundarySource, statusSource, dashboardSource] = await Promise.all([
    statusBoundaryResponse.text(),
    typedStatusResponse.text(),
    dashboardResponse.text(),
  ]);

  assert.match(statusBoundarySource, /\.\/src\/features\/dataStatus\.js/);
  assert.match(statusSource, /\/api\/v1\/operations\/status/);
  assert.doesNotMatch(statusSource, /Sincronizar agora/);
  assert.match(dashboardSource, /api\("\/operations\/sync", \{ method: "POST" \}\)/);
  assert.match(dashboardSource, /Atualizar dados/);
  assert.match(dashboardSource, /loto-lab:data-synced/);
});
