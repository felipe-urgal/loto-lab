import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { createLotoLabServer } from "../src/api/server.js";

test("generator typed enhancements are loaded with Generator 2.0 and expose the Lotofácil profile audit", async (t) => {
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
  const loaderSource = await loader.text();
  assert.match(loaderSource, /loadStyledModule\("generation-v2"\)/);
  assert.doesNotMatch(loaderSource, /loadModule\("generation-readiness"\)/);
  assert.doesNotMatch(loaderSource, /loadModule\("generation-explainability"\)/);

  const boundary = await fetch(`${baseUrl}/assets/generation-v2.js`);
  assert.equal(boundary.status, 200);
  assert.match(await boundary.text(), /generationV2\/enhancements\.js/);

  const readiness = await fetch(`${baseUrl}/assets/src/features/generationV2/readiness.js`);
  assert.equal(readiness.status, 200);
  const readinessSource = await readiness.text();
  assert.match(readinessSource, /data-g2-filter-baseline="sum"/);
  assert.match(readinessSource, /event\.isTrusted/);
  assert.match(readinessSource, /syncConditionedSumDefaults/);

  const explainability = await fetch(`${baseUrl}/assets/src/features/generationV2/explainability.js`);
  assert.equal(explainability.status, 200);
  const explainabilitySource = await explainability.text();
  assert.match(explainabilitySource, /Perfil da Lotofácil/);
  assert.match(explainabilitySource, /7–11 repetidas/);
  assert.match(explainabilitySource, /8–10 continua sendo uma preferência/);

  const enhancements = await fetch(`${baseUrl}/assets/src/features/generationV2/enhancements.js`);
  assert.equal(enhancements.status, 200);
  const enhancementsSource = await enhancements.text();
  assert.match(enhancementsSource, /onViewRendered/);
  assert.match(enhancementsSource, /onMainViewChanged/);
  assert.doesNotMatch(enhancementsSource, /location\.hash/);
  assert.doesNotMatch(enhancementsSource, /addEventListener\("hashchange"/);
});
