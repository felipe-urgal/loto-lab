import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("generator workspace follows Prototype 1 while preserving audited generation", async () => {
  const [loader, workspace, generator, explainability] = await Promise.all([
    readFile("web/feature-loader.js", "utf8"),
    readFile("web/generation-workspace.css", "utf8"),
    readFile("web/generation-v2.js", "utf8"),
    readFile("web/generation-explainability.js", "utf8"),
  ]);

  const generatorLayer = loader.indexOf('loadStyledModule("generation-v2")');
  const explainabilityLayer = loader.indexOf('loadModule("generation-explainability")');
  const workspaceLayer = loader.indexOf('loadStyle("generation-workspace")');
  assert.ok(generatorLayer >= 0, "Generator 2.0 must remain the functional owner");
  assert.ok(explainabilityLayer > generatorLayer, "explainability must remain additive");
  assert.ok(workspaceLayer > explainabilityLayer, "Prototype 1 must be the final generator style layer");
  assert.doesNotMatch(loader, /loadStyledModule\("generation-explainability"\)/);
  assert.doesNotMatch(loader, /loadStyle\("generation-explainability"\)/);
  assert.doesNotMatch(loader, /generation-diversity/);
  await assert.rejects(readFile("web/generation-explainability.css", "utf8"), /ENOENT/);
  await assert.rejects(readFile("web/generation-diversity.js", "utf8"), /ENOENT/);
  await assert.rejects(readFile("web/generation-diversity.css", "utf8"), /ENOENT/);

  assert.match(workspace, /\.g2-shell \{[\s\S]*max-width: 1440px/);
  assert.match(workspace, /\.g2-number\.is-fixed \{[\s\S]*background: var\(--accent\)[\s\S]*color: #ffffff/);
  assert.match(workspace, /\.g2-methodology \{[\s\S]*border-color: rgba\(22, 137, 255/);
  assert.match(workspace, /\.g2-saved \{[\s\S]*color: var\(--success-strong\)/);
  assert.match(workspace, /\.g2-game-month \{[\s\S]*color: var\(--accent-strong\)/);
  assert.match(workspace, /\.g2-explain-stepper \{[\s\S]*grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr auto 1fr/);
  assert.match(workspace, /\.g2-why-list \{[\s\S]*counter-reset: why/);
  assert.match(workspace, /\.g2-rationale-grid \{[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /@media \(max-width: 760px\)[\s\S]*\.g2-explain-stepper \{[\s\S]*overflow-x: auto/);
  assert.match(workspace, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(workspace, /font-size:\s*(?:[0-9]|1[0-5])px/);

  assert.match(generator, /postJson\("\/generation\/plan"/);
  assert.match(generator, /postJson\("\/generation\/preview"/);
  assert.match(generator, /postJson\("\/generation\/save"/);
  assert.match(generator, /generationMode: "diversified"/);
  assert.match(generator, /includeSeed && state\.preview\?\.generatorOptions\?\.seed/);
  assert.match(generator, /Se o histórico mudar, o save é recusado/);
  assert.match(explainability, /Isto não é previsão/);
  assert.match(explainability, /loto-lab:view-rendered/);
  assert.match(explainability, /data-g2-explain-stepper/);
});
