import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { createLotoLabServer } from "../src/api/server.js";

test("UI refinement assets are lazy-loaded for the main app and served for strategy lab", async (t) => {
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
  const html = await page.text();
  assert.doesNotMatch(html, /<link[^>]+refinements\.css/);
  assert.doesNotMatch(html, /<script[^>]+refinements\.js/);
  assert.match(html, /feature-loader\.js/);

  const loader = await fetch(`${baseUrl}/assets/feature-loader.js`);
  assert.equal(loader.status, 200);
  const loaderSource = await loader.text();
  assert.match(loaderSource, /loadStyledModule\("refinements"\)/);
  assert.match(loaderSource, /await loadStyle\(name\)/);
  assert.match(loaderSource, /return loadModule\(name\)/);

  const app = await fetch(`${baseUrl}/assets/app.js`);
  assert.equal(app.status, 200);
  const appSource = await app.text();
  assert.match(appSource, /new AbortController\(\)/);
  assert.match(appSource, /isCurrentRender/);

  const mainRefinements = await fetch(`${baseUrl}/assets/refinements.js`);
  assert.equal(mainRefinements.status, 200);
  const mainSource = await mainRefinements.text();
  assert.match(mainSource, /Como o score é calculado/);
  assert.match(mainSource, /Aguardando resultado do concurso/);
  assert.match(mainSource, /últimos 100 concursos/i);

  const generationDiversity = await fetch(`${baseUrl}/assets/generation-diversity.js`);
  assert.equal(generationDiversity.status, 200);
  const diversitySource = await generationDiversity.text();
  assert.match(diversitySource, /code\.textContent/);
  assert.match(diversitySource, /code\.title = seed/);
  assert.doesNotMatch(diversitySource, /title="\$\{seed\}"/);

  const labPage = await fetch(`${baseUrl}/lab`);
  assert.equal(labPage.status, 200);
  const labHtml = await labPage.text();
  assert.match(labHtml, /lab-refinements\.js/);
  assert.match(labHtml, /refinements\.css/);

  const labRefinements = await fetch(`${baseUrl}/assets/lab-refinements.js`);
  assert.equal(labRefinements.status, 200);
  const labSource = await labRefinements.text();
  assert.match(labSource, /Empate em/);
  assert.match(labSource, /averageHitsPerGame/);

  const labApp = await fetch(`${baseUrl}/assets/lab.js`);
  assert.equal(labApp.status, 200);
  const labAppSource = await labApp.text();
  assert.match(labAppSource, /external-rules/);
  assert.match(labAppSource, /grupo das 26/i);
});
