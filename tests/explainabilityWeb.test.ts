import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("Generator explainability supports the four-step product flow without competing navigation", async () => {
  const explainability = await source("web/src/features/generationV2/explainability.ts");
  const enhancements = await source("web/src/features/generationV2/enhancements.ts");
  const boundary = await source("web/generation-v2.js");
  const generator = await source("web/src/features/generationV2.ts");
  const workspace = await source("web/generation-workspace.css");
  const loader = await source("web/feature-loader.js");

  assert.doesNotMatch(loader, /loadModule\("generation-explainability"\)/);
  assert.doesNotMatch(loader, /loadModule\("generation-readiness"\)/);
  assert.doesNotMatch(loader, /generation-diversity/);

  assert.match(explainability, /four-step product journey/);
  assert.match(explainability, /Isto não é previsão/);
  assert.match(explainability, /Aleatório auditável/);
  assert.match(explainability, /Carteira e Experimental/);
  assert.match(explainability, /Como o motor usa esta configuração/);
  assert.match(explainability, /Fixadas, excluídas e filtros estruturais/);
  assert.match(explainability, /Auditoria do lote/);
  assert.match(explainability, /Como ler este jogo/);
  assert.match(explainability, /Semente, histórico e assinatura/);
  assert.match(explainability, /Por que este lote foi aceito/);
  assert.doesNotMatch(explainability, /Validar hipótese no Laboratório/);
  assert.doesNotMatch(explainability, /\bScore v2\b|topo do ranking|Seed, histórico e fingerprint/);

  assert.equal(
    boundary,
    'import "./src/features/generationV2.js";\nimport "./src/features/generationV2/enhancements.js";\n',
  );
  assert.match(enhancements, /installGenerationReadiness/);
  assert.match(enhancements, /installGenerationExplainability/);
  assert.match(enhancements, /onViewRendered/);
  assert.match(enhancements, /onMainViewChanged/);
  assert.doesNotMatch(enhancements, /location\.hash/);
  assert.doesNotMatch(enhancements, /addEventListener\("hashchange"/);

  assert.match(generator, /data-g2-flow-step="configure"/);
  assert.match(generator, /data-g2-flow-step="preview"/);
  assert.match(generator, /data-g2-flow-step="review"/);
  assert.match(generator, /data-g2-flow-step="save"/);
  assert.match(generator, /generationMode: "diversified"/);
  assert.match(generator, /generatorOptions\.seed/);

  await assert.rejects(source("web/generation-diversity.js"), /ENOENT/);
  await assert.rejects(source("web/generation-explainability.js"), /ENOENT/);
  await assert.rejects(source("web/generation-readiness.js"), /ENOENT/);
  await assert.rejects(source("web/generation-explainability.css"), /ENOENT/);

  assert.match(workspace, /\.g2-flow/);
  assert.match(workspace, /\.g2-education-grid/);
});

test("Strategy Lab UI exposes score-model, inference resolution and predictive validation", async () => {
  const html = await source("web/lab.html");
  const javascript = await source("web/src/features/lab.ts");

  assert.match(html, /Controles aleatórios/);
  assert.match(html, /mínimo prático \(3 variantes\)/);
  assert.match(html, /mínimo prático \(9 variantes\)/);
  assert.match(html, /Resolução insuficiente/);
  assert.match(html, /Amostra histórica pequena/);
  assert.match(html, /lab-workspace\.css/);
  assert.doesNotMatch(html, /lab-v2\.css/);
  assert.doesNotMatch(html, /\/assets\/lab\.css/);
  assert.match(javascript, /score-model/);
  assert.match(javascript, /Pontuação v1 × Pontuação v2 × sem pontuação/);
  assert.match(javascript, /minimumPracticalRandomSamples/);
  assert.match(javascript, /insufficient-resolution/);
  assert.match(javascript, /insufficient-sample/);
  assert.match(javascript, /minimumRandomSamples/);
  assert.match(javascript, /minimumObservationRounds/);
  assert.match(javascript, /amostra próxima da mediana/);
  assert.match(javascript, /EMPTY_PERIOD/);
  assert.match(javascript, /distribution\.p05/);
  assert.match(javascript, /distribution\.p50/);
  assert.match(javascript, /distribution\.p95/);
  assert.match(javascript, /strategyPercentile/);
  assert.match(javascript, /rankingQuality/);
  assert.match(javascript, /walkForward/);
  assert.match(javascript, /AUC/);
});
