import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(path, "utf8");
}

function assertMinimumExplicitFontSize(css: string, label: string, minimum = 16) {
  const sizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((match) => Number(match[1]));
  assert.ok(sizes.length > 0, `${label} should expose functional typography in source`);
  assert.ok(sizes.every((size) => size >= minimum), `${label} contains font-size below ${minimum}px: ${sizes.filter((size) => size < minimum).join(", ")}`);
}

test("web build keeps static readability and Portuguese localization without runtime font auditor", async () => {
  const pages = ["index.html", "agenda.html", "ai.html", "jobs.html", "lab.html", "strategies.html"];

  for (const page of pages) {
    const html = await source(`web-dist/${page}`);
    assert.match(html, /\/assets\/readability\.css\?v=[a-f0-9]{12}/, `${page} must load readability.css`);
    assert.doesNotMatch(html, /\/assets\/readability\.js(?:\?|["'])/, `${page} must not load readability.js`);
    assert.match(html, /\/assets\/localization\.js\?v=[a-f0-9]{12}/, `${page} must load localization.js`);
  }
});

test("static readability layer establishes a hard 16px minimum for functional text", async () => {
  const css = await source("web/readability.css");
  const refinements = await source("web/refinements.css");
  const lab = await source("web/lab.css");
  const labV2 = await source("web/lab-v2.css");
  const build = await source("scripts/buildWeb.mjs");
  const e2e = await source("scripts/e2eReadability.mjs");

  assert.match(css, /--loto-font-min: 16px/);
  assert.match(css, /body \{ font-size: 16px;/);
  assert.match(css, /th,[\s\S]*td,[\s\S]*font-size: 16px !important;/);
  assert.match(css, /\.field input,[\s\S]*\.field select[\s\S]*font-size: 16px !important;/);
  assert.match(css, /\.a2-panel-head strong,[\s\S]*font-size: 16px !important;/);
  assert.doesNotMatch(css, /readability-min-text/);
  assert.doesNotMatch(build, /readability\.js/);
  assert.doesNotMatch(e2e, /readability-min-text/);
  assert.match(e2e, /getComputedStyle\(el\)\.fontSize/);
  assert.match(e2e, /size < minimum - 0\.01/);

  assertMinimumExplicitFontSize(css, "readability.css");
  assertMinimumExplicitFontSize(refinements, "refinements.css");
  assertMinimumExplicitFontSize(lab, "lab.css");
  assertMinimumExplicitFontSize(labV2, "lab-v2.css");
});

test("localization keeps product vocabulary in Portuguese and scopes dynamic replacements to system UI", async () => {
  const js = await source("web/localization.js");

  for (const translation of [
    '["Dashboard", "Painel"]',
    '["Backtests", "Testes históricos"]',
    '["Strategy console", "Console de estratégias"]',
    '["Ranking", "Classificação"]',
    '["Score", "Pontuação"]',
    '["Lookback", "Janela histórica"]',
    '["Bucket", "Bloco"]',
    '["Slug", "Identificador"]',
    '["queued", "na fila"]',
    '["running", "em execução"]',
  ]) {
    assert.ok(js.includes(translation), `missing translation: ${translation}`);
  }

  assert.match(js, /function shouldUseOperationalVocabulary/);
  assert.match(js, /\.job-result/);
  assert.match(js, /\.status-pill/);
  assert.match(js, /function replaceAnalysisTerms/);

  const knownStart = js.indexOf("function replaceKnownPhrases");
  const knownEnd = js.indexOf("function replaceOperationalTerms");
  assert.ok(knownStart >= 0 && knownEnd > knownStart);
  const knownFunction = js.slice(knownStart, knownEnd);
  assert.doesNotMatch(knownFunction, /\\bBacktests/, "broad Backtests replacement must not run on arbitrary user text");
});
