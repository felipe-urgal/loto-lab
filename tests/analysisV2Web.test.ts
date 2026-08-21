import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Analyses 2.0 is lazy-loaded and exposes the five analysis modes", async () => {
  const [source, css, loader, services] = await Promise.all([
    readFile("web/analysis-v2.js", "utf8"),
    readFile("web/analysis-v2.css", "utf8"),
    readFile("web/feature-loader.js", "utf8"),
    readFile("src/api/services.ts", "utf8"),
  ]);

  assert.match(loader, /view === "analysis"/);
  assert.match(loader, /loadStyledModule\("analysis-v2"\)/);
  assert.match(source, /Ranking/);
  assert.match(source, /Estrutura/);
  assert.match(source, /Dinâmica/);
  assert.match(source, /Combinações/);
  assert.match(source, /Validação/);
  assert.match(source, /Observado × esperado/);
  assert.match(source, /data-a2-number/);
  assert.match(source, /data-a2-pair-check/);
  assert.match(source, /data-a2-validation-window/);
  assert.match(source, /Atraso e frequência são descrições históricas/);
  assert.match(css, /\.a2-tabs/);
  assert.match(css, /\.a2-detail/);
  assert.match(css, /\.a2-heatmap/);
  assert.match(services, /buildAdvancedAnalysis\(contests, config\)/);
  assert.match(services, /\n\s+advanced,\n/);
});
