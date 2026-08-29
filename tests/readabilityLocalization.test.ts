import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("web build relies on source styles without readability correction layers", async () => {
  const pages = ["index.html", "agenda.html", "ai.html", "jobs.html", "lab.html", "strategies.html"];

  for (const page of pages) {
    const html = await source(`web-dist/${page}`);
    assert.doesNotMatch(html, /\/assets\/readability\.css(?:\?|["'])/, `${page} must not load readability.css`);
    assert.doesNotMatch(html, /\/assets\/readability\.js(?:\?|["'])/, `${page} must not load readability.js`);
    assert.match(html, /\/assets\/localization\.js\?v=[a-f0-9]{12}/, `${page} must load localization.js`);
  }
});

test("canonical stylesheets own the hard 16px minimum for functional text", async () => {
  const build = await source("scripts/buildWeb.mjs");
  const e2e = await source("scripts/e2eReadability.mjs");
  const cssFiles = (await readdir("web")).filter((file) => file.endsWith(".css")).sort();
  const violations: string[] = [];

  for (const file of cssFiles) {
    const css = await source(`web/${file}`);
    for (const match of css.matchAll(/font-size:\s*(\d+)px/g)) {
      const size = Number(match[1]);
      if (size < 16) violations.push(`${file}:${size}px`);
    }
  }

  assert.doesNotMatch(build, /readability\.css/);
  assert.doesNotMatch(build, /readability\.js/);
  assert.doesNotMatch(e2e, /readability-min-text/);
  assert.match(e2e, /getComputedStyle\(el\)\.fontSize/);
  assert.match(e2e, /size < minimum - 0\.01/);
  assert.deepEqual(violations, [], `canonical CSS contains font-size below 16px: ${violations.join(", ")}`);
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
