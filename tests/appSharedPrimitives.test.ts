import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function appSource(): Promise<string> {
  return readFile(resolve(process.cwd(), "web/app.js"), "utf8");
}

test("legacy app consumes canonical shared primitives instead of redefining them", async () => {
  const app = await appSource();

  assert.match(app, /import \{ api \} from "\.\/src\/core\/api\.js"/);
  assert.match(app, /import \{ escapeHtml \} from "\.\/src\/shared\/escaping\.js"/);
  assert.match(app, /formatCurrency, formatDateTime, formatPercent/);
  assert.match(app, /import \{ toast \} from "\.\/src\/shared\/toast\.js"/);
  assert.match(app, /async function safeApi/);

  assert.doesNotMatch(app, /const API = "\/api\/v1"/);
  assert.doesNotMatch(app, /function escapeHtml\(/);
  assert.doesNotMatch(app, /async function api\(/);
  assert.doesNotMatch(app, /function formatDateTime\(/);
  assert.doesNotMatch(app, /function formatCurrency\(/);
  assert.doesNotMatch(app, /function formatPercent\(/);
  assert.doesNotMatch(app, /function toast\(/);
});
