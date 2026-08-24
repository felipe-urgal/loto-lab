import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { createLotoLabServer } from "../src/api/server.js";

test("generator readiness is loaded with Generator 2.0 and exposes the Lotofácil profile audit", async (t) => {
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
  const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

  const loader = await fetch(`${baseUrl}/assets/feature-loader.js`);
  assert.equal(loader.status, 200);
  assert.match(await loader.text(), /loadModule\("generation-readiness"\)/);

  const readiness = await fetch(`${baseUrl}/assets/generation-readiness.js`);
  assert.equal(readiness.status, 200);
  const readinessSource = await readiness.text();
  assert.match(readinessSource, /data-g2-filter-baseline="sum"/);
  assert.match(readinessSource, /event\.isTrusted/);
  assert.match(readinessSource, /syncConditionedSumDefaults/);

  const explainability = await fetch(`${baseUrl}/assets/generation-explainability.js`);
  assert.equal(explainability.status, 200);
  const explainabilitySource = await explainability.text();
  assert.match(explainabilitySource, /Perfil da Lotofácil/);
  assert.match(explainabilitySource, /7–11 repetidas/);
  assert.match(explainabilitySource, /8–10 continua sendo uma preferência/);
});
