import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("Laboratório exposes Backtests as a contextual next step without cross-page state", async () => {
  const html = await source("web/lab.html");
  const resultsIndex = html.indexOf('id="lab-results" hidden');
  const ctaIndex = html.indexOf('href="/#backtests"');

  assert.ok(resultsIndex >= 0, "result workspace must remain lazy/hidden before an experiment");
  assert.ok(ctaIndex > resultsIndex, "Backtests CTA must live in the result context");
  assert.match(html, /<a class="button secondary" href="\/#backtests">Testar historicamente<\/a>/);
  assert.doesNotMatch(html, /href="\/#backtests\?/);
  assert.match(html, /O Laboratório não copia nem pré-preenche o formulário de Backtests/);
});
