import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

test("jobs workspace follows Prototype 1 while preserving queue contracts", async () => {
  const [html, workspace, boundary, jobs] = await Promise.all([
    readFile("web/jobs.html", "utf8"),
    readFile("web/jobs-workspace.css", "utf8"),
    readFile("web/jobs.js", "utf8"),
    readFile("web/src/features/jobs.ts", "utf8"),
  ]);

  assert.match(html, /\/assets\/jobs-workspace\.css/);
  assert.doesNotMatch(html, /\/assets\/experiments\.css/);
  await assert.rejects(access("web/experiments.css"));

  assert.match(workspace, /\.experiment-grid:has\(#job-form\) \{[\s\S]*display: grid[\s\S]*align-items: start/);
  assert.match(workspace, /\.experiment-grid:has\(#job-form\) \{[\s\S]*max-width: 1440px/);
  assert.match(workspace, /#jobs-list \.experiment-card-head \{[\s\S]*display: flex[\s\S]*justify-content: space-between/);
  assert.match(workspace, /#jobs-list \.experiment-meta \{[\s\S]*display: flex[\s\S]*flex-wrap: wrap/);
  assert.match(workspace, /#jobs-list \.job-running \{[\s\S]*display: inline-flex[\s\S]*align-items: center/);
  assert.match(workspace, /#job-form \.form-grid \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /#jobs-list \.status-pill\.queued \{[\s\S]*background: var\(--warning-soft\)/);
  assert.match(workspace, /#jobs-list \.status-pill\.running \{[\s\S]*background: var\(--accent-soft\)/);
  assert.match(workspace, /#jobs-list \.status-pill\.succeeded,[\s\S]*\.status-pill\.completed \{[\s\S]*background: var\(--success-soft\)/);
  assert.match(workspace, /#jobs-list \.status-pill\.failed,[\s\S]*\.status-pill\.cancelled \{[\s\S]*background: var\(--danger-soft\)/);
  assert.match(workspace, /@media \(max-width: 680px\)[\s\S]*#jobs-list \.experiment-card-head \{[\s\S]*flex-direction: column/);
  assert.match(workspace, /@media \(max-width: 640px\)[\s\S]*#job-form \.form-grid \{[\s\S]*grid-template-columns: 1fr/);
  assert.match(workspace, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(workspace, /font-size:\s*(?:[0-9]|1[0-5])px/);

  assert.equal(boundary.trim(), 'import "./src/features/jobs.js";');
  assert.ok(jobs.includes('from "../core/api.js"'));
  assert.ok(jobs.includes('from "../shared/escaping.js"'));
  assert.ok(jobs.includes('from "../shared/formatters.js"'));
  assert.ok(jobs.includes('from "../shared/toast.js"'));
  assert.ok(!jobs.includes("runtime.js"));

  assert.ok(jobs.includes('api<AnalysisJob>("/analysis-jobs", {'));
  assert.ok(jobs.includes('method: "POST"'));
  assert.ok(jobs.includes("body.strategyVersionId = Number(strategySelect.value)"));
  assert.ok(jobs.includes("body.randomSamples = Number(randomSamples.value)"));
  assert.ok(jobs.includes("pollTimer = window.setTimeout(() =>"));
  assert.ok(jobs.includes("void loadJobs(false)"));
  assert.ok(jobs.includes('await loadStrategies(params.get("strategyVersionId"))'));
  assert.ok(jobs.includes("token !== strategyLoadToken || lottery.value !== requestedLottery"));
  assert.ok(jobs.includes("token !== loadToken || lottery.value !== requestedLottery"));
  assert.ok(jobs.includes("await Promise.all([loadStrategies(), loadJobs()])"));
  assert.ok(jobs.includes("requiredPayload("));
});
