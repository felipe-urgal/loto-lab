import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Jobs exposes Strategy Lab v2 options and evidence-aware language", async () => {
  const [html, script] = await Promise.all([
    readFile("web/jobs.html", "utf8"),
    readFile("web/jobs.js", "utf8"),
  ]);

  assert.match(html, /value="score-model"/);
  assert.match(html, /id="job-random-samples"/);
  assert.match(html, /250/);
  assert.match(script, /Melhor no período:/);
  assert.match(script, /insufficient-resolution/);
  assert.doesNotMatch(script, /Vencedor:/);
});
