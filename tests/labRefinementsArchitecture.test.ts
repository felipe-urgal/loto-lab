import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("lab refinements keep a thin JavaScript boundary with TypeScript ownership", async () => {
  const [boundary, owner, html] = await Promise.all([
    source("web/lab-refinements.js"),
    source("web/src/features/labRefinements.ts"),
    source("web/lab.html"),
  ]);

  assert.equal(boundary.trim(), 'import "./src/features/labRefinements.js";');
  assert.doesNotMatch(boundary, /MutationObserver|lab-primary-metric|averageHitsPerGame/);

  assert.match(owner, /function refineTie\(\): void/);
  assert.match(owner, /function refineMetric\(\): void/);
  assert.match(owner, /function refineAxisLabels\(\): void/);
  assert.match(owner, /new MutationObserver\(schedule\)/);
  assert.match(owner, /metric\?\.addEventListener/);

  assert.match(html, /src="\/assets\/lab-refinements\.js"/);
});
