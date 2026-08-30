import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("jobs workspace follows Prototype 1 while preserving queue contracts", async () => {
  const [html, workspace, jobs] = await Promise.all([
    readFile("web/jobs.html", "utf8"),
    readFile("web/jobs-workspace.css", "utf8"),
    readFile("web/jobs.js", "utf8"),
  ]);

  const experiments = html.indexOf('/assets/experiments.css');
  const workspaceLayer = html.indexOf('/assets/jobs-workspace.css');
  assert.ok(experiments >= 0, "shared experiment styles must remain available");
  assert.ok(workspaceLayer > experiments, "Prototype 1 must be the final Jobs presentation layer");

  assert.match(workspace, /\.experiment-grid:has\(#job-form\) \{[\s\S]*max-width: 1440px/);
  assert.match(workspace, /#job-form \.form-grid \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /#jobs-list \.status-pill\.queued \{[\s\S]*background: var\(--warning-soft\)/);
  assert.match(workspace, /#jobs-list \.status-pill\.running \{[\s\S]*background: var\(--accent-soft\)/);
  assert.match(workspace, /#jobs-list \.status-pill\.succeeded,[\s\S]*\.status-pill\.completed \{[\s\S]*background: var\(--success-soft\)/);
  assert.match(workspace, /#jobs-list \.status-pill\.failed,[\s\S]*\.status-pill\.cancelled \{[\s\S]*background: var\(--danger-soft\)/);
  assert.match(workspace, /@media \(max-width: 640px\)[\s\S]*#job-form \.form-grid \{[\s\S]*grid-template-columns: 1fr/);
  assert.match(workspace, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(workspace, /font-size:\s*(?:[0-9]|1[0-5])px/);

  assert.match(jobs, /api\("\/analysis-jobs", \{ method: "POST"/);
  assert.match(jobs, /api\(`\/analysis-jobs\/\$\{button\.dataset\.cancelJob\}\/cancel`, \{ method: "POST" \}\)/);
  assert.match(jobs, /api\(`\/analysis-jobs\?lottery=\$\{encodeURIComponent\(requestedLottery\)\}&limit=100`\)/);
  assert.match(jobs, /body\.strategyVersionId = Number\(strategySelect\.value\)/);
  assert.match(jobs, /body\.randomSamples = Number\(randomSamples\.value\)/);
  assert.match(jobs, /window\.setTimeout\(\(\) => \{ void loadJobs\(false\); \}, 1800\)/);
  assert.match(jobs, /await loadStrategies\(params\.get\("strategyVersionId"\)\)/);
});
