import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function appSource(): Promise<string> {
  return readFile(resolve(process.cwd(), "web/app.js"), "utf8");
}

test("main app stays a thin shell while canonical features own data access", async () => {
  const app = await appSource();

  assert.equal(app.trim(), 'import "./src/features/generatorPage.js";');

  assert.doesNotMatch(app, /import \{ api \}/);
  assert.doesNotMatch(app, /import \{ toast \}/);
  assert.doesNotMatch(app, /async function safeApi/);
  assert.doesNotMatch(app, /games\/generate|generation\/preview|generation\/save/);
  assert.doesNotMatch(app, /const API = "\/api\/v1"/);
  assert.doesNotMatch(app, /function escapeHtml\(/);
  assert.doesNotMatch(app, /async function api\(/);
  assert.doesNotMatch(app, /function formatDateTime\(/);
  assert.doesNotMatch(app, /function formatCurrency\(/);
  assert.doesNotMatch(app, /function formatPercent\(/);
  assert.doesNotMatch(app, /function toast\(/);
  assert.doesNotMatch(app, /renderToken|renderController/);
  assert.doesNotMatch(app, /new AbortController\(/);
  assert.doesNotMatch(app, /location\.hash\.replace/);
  assert.doesNotMatch(app, /function metric\(/);
});
