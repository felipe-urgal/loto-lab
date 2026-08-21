import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Analyses 2.0 is lazy-loaded and exposes the five analysis modes", async () => {
  const [source, css, loader, services, advanced] = await Promise.all([
    readFile("web/analysis-v2.js", "utf8"),
    readFile("web/analysis-v2.css", "utf8"),
    readFile("web/feature-loader.js", "utf8"),
    readFile("src/api/services.ts", "utf8"),
    readFile("src/analysis/advanced.ts", "utf8"),
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
  assert.match(source, /role="tablist"/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /Escape/);
  assert.match(source, /Histórico com lacunas/);
  assert.doesNotMatch(source, /const cache = new Map\(\)/);
  assert.doesNotMatch(source, /lotterySelect\?\.addEventListener\("change"/);
  assert.match(css, /\.a2-tabs/);
  assert.match(css, /\.a2-detail-open/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /position: sticky/);
  assert.match(advanced, /exactBinomialTwoSidedP/);
  assert.match(advanced, /bonferroni-\$\{VALIDATION_COMPARISONS\}-tests/);
  assert.match(advanced, /latestContinuousSegment/);
  assert.match(services, /buildAdvancedAnalysis\(contests, config\)/);
  assert.match(services, /\n\s+advanced,\n/);
});
