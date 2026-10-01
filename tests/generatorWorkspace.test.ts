import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("generator workspace follows Redesign V2 while preserving audited generation", async () => {
  const [loader, workspace, boundary, generator, types, explainability, enhancements] = await Promise.all([
    readFile("web/src/core/featureLoader.ts", "utf8"),
    readFile("web/generation-workspace.css", "utf8"),
    readFile("web/generation-v2.js", "utf8"),
    readFile("web/src/features/generationV2.ts", "utf8"),
    readFile("web/src/features/generationV2/types.ts", "utf8"),
    readFile("web/src/features/generationV2/explainability.ts", "utf8"),
    readFile("web/src/features/generationV2/enhancements.ts", "utf8"),
  ]);

  const generatorLayer = loader.indexOf('loadStyledModule("generation-v2")');
  const workspaceLayer = loader.indexOf('loadStyle("generation-workspace")');
  assert.ok(generatorLayer >= 0, "Generator 2.0 must remain the functional owner");
  assert.ok(workspaceLayer > generatorLayer, "Redesign V2 must remain the final generator style layer");
  assert.doesNotMatch(loader, /loadModule\("generation-explainability"\)/);
  assert.doesNotMatch(loader, /loadModule\("generation-readiness"\)/);
  assert.doesNotMatch(loader, /loadStyledModule\("generation-explainability"\)/);
  assert.doesNotMatch(loader, /loadStyle\("generation-explainability"\)/);
  assert.doesNotMatch(loader, /generation-diversity/);
  await assert.rejects(readFile("web/generation-explainability.js", "utf8"), /ENOENT/);
  await assert.rejects(readFile("web/generation-readiness.js", "utf8"), /ENOENT/);
  await assert.rejects(readFile("web/generation-explainability.css", "utf8"), /ENOENT/);
  await assert.rejects(readFile("web/generation-diversity.js", "utf8"), /ENOENT/);
  await assert.rejects(readFile("web/generation-diversity.css", "utf8"), /ENOENT/);

  assert.match(workspace, /\.g2-shell \{[\s\S]*max-width: var\(--content-max-width\)/);
  assert.match(workspace, /\.g2-flow \{[\s\S]*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /\.g2-number\.is-fixed \{[\s\S]*background: var\(--accent\)[\s\S]*color: #ffffff/);
  assert.match(workspace, /\.g2-methodology \{[\s\S]*border-color: var\(--border\)/);
  assert.match(workspace, /\.g2-saved \{[\s\S]*color: var\(--success-strong\)/);
  assert.match(workspace, /\.g2-game-month \{[\s\S]*color: var\(--accent-strong\)/);
  assert.match(workspace, /\.g2-review-summary \{[\s\S]*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /\.g2-rationale-grid \{[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(workspace, /@media \(max-width: 760px\)[\s\S]*\.g2-flow/);
  assert.match(workspace, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(workspace, /font-size:\s*(?:[0-9]|1[0-5])px/);

  assert.equal(
    boundary,
    'import "./src/features/generationV2.js";\nimport "./src/features/generationV2/enhancements.js";\n',
  );
  assert.match(generator, /from "\.\.\/core\/api\.js"/);
  assert.match(generator, /from "\.\.\/core\/mainContext\.js"/);
  assert.match(generator, /from "\.\.\/core\/viewLifecycle\.js"/);
  assert.match(generator, /from "\.\.\/shared\/escaping\.js"/);
  assert.doesNotMatch(generator, /fetch\(/);
  assert.doesNotMatch(generator, /location\.hash = "games"/);
  assert.match(types, /from "\.\.\/\.\.\/core\/mainContext\.js"/);
  assert.match(types, /export type LotteryGenerationConfig/);
  assert.match(types, /export type GenerationPlan/);
  assert.match(types, /export type GeneratorState/);
  assert.match(generator, /api<\{ items\?: LotteryGenerationConfig\[\] \}>\("\/lotteries"/);
  assert.match(generator, /betSize: lotteryConfig\.defaultBetSize/);
  assert.doesNotMatch(generator, /LOTTERY_FALLBACK/);
  assert.match(generator, /postJson<GenerationPlan>\("\/generation\/plan"/);
  assert.match(generator, /postJson<GenerationPreviewResponse>\("\/generation\/preview"/);
  assert.match(generator, /postJson<GenerationSaveResponse>\("\/generation\/save"/);
  assert.match(generator, /includeSeed \? state\.preview\?\.generatorOptions\.seed/);
  assert.match(generator, /state\.preview = null/);
  assert.match(generator, /state\.purpose === "experimental" \? \(tiers\.get\(value\) \|\| ""\) : ""/);
  assert.match(generator, /Salvar grava exatamente os jogos exibidos abaixo/);
  assert.match(generator, /disponível no Painel/);
  assert.match(explainability, /Isto não é previsão/);
  assert.match(explainability, /four-step product journey/);
  assert.match(enhancements, /onViewRendered/);
  assert.match(enhancements, /onMainViewChanged/);
  assert.doesNotMatch(enhancements, /location\.hash/);
  assert.doesNotMatch(enhancements, /addEventListener\("hashchange"/);
});
