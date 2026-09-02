import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

test("strategy lab workspace follows Prototype 1 while preserving statistical contracts", async () => {
  const [html, workspace, boundary, lab, refinements] = await Promise.all([
    readFile("web/lab.html", "utf8"),
    readFile("web/lab-workspace.css", "utf8"),
    readFile("web/lab.js", "utf8"),
    readFile("web/src/features/lab.ts", "utf8"),
    readFile("web/lab-refinements.js", "utf8"),
  ]);

  const sharedRefinements = html.indexOf('/assets/refinements.css');
  const workspaceLayer = html.indexOf('/assets/lab-workspace.css');
  assert.ok(sharedRefinements >= 0, "shared refinements must remain available");
  assert.ok(workspaceLayer > sharedRefinements, "Prototype 1 must remain the final Lab style layer");
  assert.doesNotMatch(html, /\/assets\/lab\.css/);
  assert.doesNotMatch(html, /\/assets\/lab-v2\.css/);
  await assert.rejects(access("web/lab.css"));
  await assert.rejects(access("web/lab-v2.css"));

  assert.match(workspace, /\.lab-intro \{[\s\S]*display: flex[\s\S]*justify-content: space-between/);
  assert.match(workspace, /\.lab-message \{[\s\S]*display: grid[\s\S]*place-content: center/);
  assert.match(workspace, /\.lab-ranking \{[\s\S]*display: grid[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /\.lab-benchmark-card \{[\s\S]*grid-column: 1 \/ -1[\s\S]*display: flex/);
  assert.match(workspace, /\.lab-distribution \{[\s\S]*display: grid[\s\S]*grid-template-columns: repeat\(4, minmax\(70px, 1fr\)\)/);
  assert.match(workspace, /\.lab-predictive-evidence \{[\s\S]*grid-column: 1 \/ -1[\s\S]*display: grid/);
  assert.match(workspace, /\.lab-chart svg \{[\s\S]*display: block[\s\S]*min-height: 285px/);
  assert.match(workspace, /#lab-form \.lab-form-grid \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /\.lab-benchmark-card\.is-positive \{[\s\S]*background: var\(--success-soft\)/);
  assert.match(workspace, /\.lab-strategy-card\.is-winner \{[\s\S]*border-color: rgba\(22, 137, 255, 0\.4\)/);
  assert.match(workspace, /\.lab-primary-metric strong\.positive \{[\s\S]*color: var\(--success-strong\)/);
  assert.match(workspace, /\.lab-primary-metric strong\.negative \{[\s\S]*color: var\(--danger\)/);
  assert.match(workspace, /@media \(max-width: 760px\)[\s\S]*#lab-form \.lab-form-grid \{[\s\S]*grid-template-columns: 1fr/);
  assert.match(workspace, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(workspace, /font-size:\s*(?:[0-9]|1[0-5])px/);

  assert.equal(boundary.trim(), 'import "./src/features/lab.js";');
  assert.ok(lab.includes('from "../core/api.js"'));
  assert.ok(lab.includes('from "../shared/escaping.js"'));
  assert.ok(lab.includes('from "../shared/formatters.js"'));
  assert.ok(!lab.includes('const API = "/api/v1"'));
  assert.ok(!lab.includes("async function api("));
  assert.ok(!lab.includes("function escapeHtml("));
  assert.ok(!lab.includes("function formatPercent("));
  assert.ok(!lab.includes("function formatCurrency("));

  assert.ok(lab.includes('api<StrategyLabResult>("/lab/compare", {'));
  assert.ok(lab.includes("experiment: selectedExperiment()"));
  assert.ok(lab.includes("warmupContests: Number(warmupInput.value)"));
  assert.ok(lab.includes("randomSamples: Number(randomSamplesInput.value)"));
  assert.ok(lab.includes("selectedLottery() !== requestedLottery"));
  assert.ok(lab.includes("selectedExperiment() !== requestedExperiment"));
  assert.ok(lab.includes("message.replaceChildren(strong, paragraph)"));
  assert.ok(lab.includes("const contestCount = finiteNumber(item.contestCount)"));
  assert.ok(lab.includes("formatPercent(item.financialCoverage)"));
  assert.ok(!lab.includes("formatPercent(Number(item.financialCoverage))"));
  assert.match(lab, /AUC 0,500 equivale a ordenação sem informação/);
  assert.match(lab, /corrigir o número de variantes testadas/);

  assert.match(refinements, /function refineTie\(\)/);
  assert.match(refinements, /function refineMetric\(\)/);
  assert.match(refinements, /Empate em \$\{basisName\}/);
});
