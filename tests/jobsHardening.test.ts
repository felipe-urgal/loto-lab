import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Jobs exposes Strategy Lab v2 options and evidence-aware language", async () => {
  const [html, boundary, jobs] = await Promise.all([
    readFile("web/jobs.html", "utf8"),
    readFile("web/jobs.js", "utf8"),
    readFile("web/src/features/jobs.ts", "utf8"),
  ]);

  assert.match(html, /value="score-model"/);
  assert.match(html, /id="job-random-samples"/);
  assert.match(html, /250/);
  assert.equal(boundary.trim(), 'import "./src/features/jobs.js";');
  assert.match(jobs, /Melhor no período:/);
  assert.match(jobs, /insufficient-resolution/);
  assert.doesNotMatch(jobs, /Vencedor:/);
  assert.match(jobs, /function statusClass\(status: string\)/);
  assert.match(jobs, /Number\.isSafeInteger\(jobId\)/);
  assert.match(jobs, /encodeURIComponent\(String\(jobId\)\)/);
});
