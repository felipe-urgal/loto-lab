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
    assert.match(html, /\/assets\/localization\.js\?v=[a-f0-9]{12}/, `${page} must load localization.js`);
  }
});

test("readability layer raises tiny functional typography without flattening hierarchy", async () => {
  const css = await source("web/readability.css");

  assert.match(css, /body \{ font-size: 14px;/);
  assert.match(css, /\.nav-item,[\s\S]*font-size: 14px !important;/);
  assert.match(css, /\.topbar-copy p \{ font-size: 14px !important;/);
  assert.match(css, /th \{ font-size: 11px !important;/);
  assert.match(css, /td \{ font-size: 13px !important;/);
  assert.match(css, /\.field input,[\s\S]*font-size: 13px !important;/);
  assert.match(css, /\.a2-tabs button \{ font-size: 13px !important;/);
  assert.match(css, /\.a2-panel-head span,[\s\S]*font-size: 12px !important;/);
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
  assert.doesNotMatch(js, /function replaceKnownPhrases[\s\S]*?replace\(\/\\bBacktests/, "broad Backtests replacement must not run on arbitrary user text");
});
