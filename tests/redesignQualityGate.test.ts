import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("generator quality gate covers the direct flow at three viewports", async () => {
  const read = (path: string) => readFile(path, "utf8");
  const [packageSource, e2e, ci, html, css, design] = await Promise.all([
    read("package.json"), read("scripts/e2eGeneratorPage.mjs"), read(".github/workflows/ci.yml"),
    read("web/index.html"), read("web/generator.css"), read("docs/design/REDESIGN_V2.md"),
  ]);
  const pkg = JSON.parse(packageSource) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts["test:e2e"], "npm run test:e2e:redesign");
  assert.match(pkg.scripts["test:e2e:redesign"], /e2eGeneratorPage\.mjs.*e2eCriticalRoutes\.mjs/);
  assert.match(pkg.scripts["quality:e2e-syntax"], /node --check scripts\/e2eGeneratorPage\.mjs/);
  assert.match(ci, /e2e-redesign:/);
  assert.match(ci, /run: npm run test:e2e:redesign/);
  assert.match(ci, /npm run db:migrate/);
  assert.match(ci, /npm run test:e2e:seed/);
  for (const viewport of ["1440, height: 900", "820, height: 1180", "390, height: 844"]) assert.ok(e2e.includes(viewport));
  for (const contract of ["MIN_CONTROL_PX = 44", "MIN_FONT_PX = 16", "document overflow", "selections/cardinality", "Keyboard focus", "Reduced motion", "Async feedback", "Uncaught browser exceptions"]) assert.ok(e2e.includes(contract), contract);
  assert.match(html, /id="sync-status"[^>]*role="status"/);
  assert.match(html, /id="recent-results" aria-live="polite"/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(design, /Página única/);
  assert.match(design, /sem login/i);
});
