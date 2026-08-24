import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Generator explainability layer exposes the five-step flow and methodology guardrails", async () => {
  const javascript = await source("web/generation-explainability.js");
  const css = await source("web/generation-explainability.css");
  const loader = await source("web/feature-loader.js");

  assert.match(loader, /generation-explainability/);
  assert.match(javascript, /Análise/);
  assert.match(javascript, /Núcleo fixo/);
  assert.match(javascript, /Variáveis/);
  assert.match(javascript, /Restrições/);
  assert.match(javascript, /Auditoria/);
  assert.match(javascript, /Isto não é previsão/);
  assert.match(javascript, /Score v2/);
  assert.match(javascript, /Por que este lote foi aceito/);
  assert.match(javascript, /Validar hipótese no Laboratório/);
  assert.match(css, /g2-explain-stepper/);
  assert.match(css, /g2-education-grid/);
});

test("Strategy Lab UI exposes score-model comparison and random benchmark distribution", async () => {
  const html = await source("web/lab.html");
  const javascript = await source("web/lab.js");

  assert.match(html, /Controles aleatórios/);
  assert.match(html, /Como interpretar/);
  assert.match(html, /lab-v2\.css/);
  assert.match(javascript, /score-model/);
  assert.match(javascript, /Score v1 × Score v2 × sem score/);
  assert.match(javascript, /distribution\.p05/);
  assert.match(javascript, /distribution\.p50/);
  assert.match(javascript, /distribution\.p95/);
  assert.match(javascript, /strategyPercentile/);
});
