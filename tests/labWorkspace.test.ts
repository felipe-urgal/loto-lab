import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("strategy lab workspace follows Prototype 1 while preserving statistical contracts", async () => {
  const [html, workspace, lab, refinements] = await Promise.all([
    readFile("web/lab.html", "utf8"),
    readFile("web/lab-workspace.css", "utf8"),
    readFile("web/lab.js", "utf8"),
    readFile("web/lab-refinements.js", "utf8"),
  ]);

  const baseLab = html.indexOf('/assets/lab.css');
  const labV2 = html.indexOf('/assets/lab-v2.css');
  const sharedRefinements = html.indexOf('/assets/refinements.css');
  const workspaceLayer = html.indexOf('/assets/lab-workspace.css');
  assert.ok(baseLab >= 0, "base Lab styles must remain available");
  assert.ok(labV2 > baseLab, "Lab v2 must remain layered after the base Lab styles");
  assert.ok(sharedRefinements > labV2, "shared refinements must remain before final presentation");
  assert.ok(workspaceLayer > sharedRefinements, "Prototype 1 must be the final Lab presentation layer");

  assert.match(workspace, /\.lab-content > \.stack \{[\s\S]*max-width: 1440px/);
  assert.match(workspace, /#lab-form \.lab-form-grid \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /\.lab-benchmark-card\.is-positive \{[\s\S]*background: var\(--success-soft\)/);
  assert.match(workspace, /\.lab-strategy-card\.is-winner \{[\s\S]*border-color: rgba\(22, 137, 255, 0\.4\)/);
  assert.match(workspace, /\.lab-primary-metric strong\.positive \{[\s\S]*color: var\(--success-strong\)/);
  assert.match(workspace, /\.lab-primary-metric strong\.negative \{[\s\S]*color: var\(--danger\)/);
  assert.match(workspace, /@media \(max-width: 760px\)[\s\S]*#lab-form \.lab-form-grid \{[\s\S]*grid-template-columns: 1fr/);
  assert.match(workspace, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(workspace, /font-size:\s*(?:[0-9]|1[0-5])px/);

  assert.match(lab, /api\("\/lab\/compare", \{/);
  assert.match(lab, /experiment: selectedExperiment\(\)/);
  assert.match(lab, /warmupContests: Number\(warmupInput\.value\)/);
  assert.match(lab, /randomSamples: Number\(randomSamplesInput\.value\)/);
  assert.match(lab, /AUC 0,500 equivale a ordenação sem informação/);
  assert.match(lab, /corrigir o número de variantes testadas/);

  assert.match(refinements, /function refineTie\(\)/);
  assert.match(refinements, /function refineMetric\(\)/);
  assert.match(refinements, /Empate em \$\{basisName\}/);
});
