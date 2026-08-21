import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("web build injects readability and Portuguese localization into every HTML entrypoint", async () => {
  const pages = ["index.html", "agenda.html", "ai.html", "jobs.html", "lab.html", "strategies.html"];

  for (const page of pages) {
    const html = await source(`web-dist/${page}`);
    assert.match(html, /\/assets\/readability\.css\?v=[a-f0-9]{12}/, `${page} must load readability.css`);
    assert.match(html, /\/assets\/readability\.js\?v=[a-f0-9]{12}/, `${page} must load readability.js`);
    assert.match(html, /\/assets\/localization\.js\?v=[a-f0-9]{12}/, `${page} must load localization.js`);
  }
});

test("readability layer establishes a hard 16px minimum for functional text", async () => {
  const css = await source("web/readability.css");
  const js = await source("web/readability.js");

  assert.match(css, /--loto-font-min: 16px/);
  assert.match(css, /body \{ font-size: 16px;/);
  assert.match(css, /\.readability-min-text \{ font-size: 16px !important;/);
  assert.match(css, /th,[\s\S]*td,[\s\S]*font-size: 16px !important;/);
  assert.match(css, /\.field input,[\s\S]*\.field select[\s\S]*font-size: 16px !important;/);
  assert.match(css, /\.a2-panel-head strong,[\s\S]*font-size: 16px !important;/);
  assert.match(js, /const MIN_FONT_PX = 16;/);
  assert.match(js, /size < MIN_FONT_PX/);
  assert.match(js, /MutationObserver/);

  const fontSizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((match) => Number(match[1]));
  assert.ok(fontSizes.length > 20, "readability.css should explicitly cover the UI typography");
  assert.ok(fontSizes.every((size) => size >= 16), `readability.css contains font-size below 16px: ${fontSizes.filter((size) => size < 16).join(", ")}`);
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
