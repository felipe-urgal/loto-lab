import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const [source, fallbackSource] = await Promise.all([
  readFile(resolve(process.cwd(), "web/my-games-v2.js"), "utf8"),
  readFile(resolve(process.cwd(), "web/real-bets.js"), "utf8"),
]);

test("My Games keeps exploratory comparison separate from real financial accounting", () => {
  assert.match(source, /Comparar concursos/);
  assert.match(source, /Esta análise não altera apostas nem histórico financeiro/);
  assert.match(source, /Resultado da aposta/);
  assert.match(source, /Custo real/);
  assert.doesNotMatch(source, /data-mg2-check=/);
  assert.doesNotMatch(source, /Number\(bet\.netResult \|\| 0\)/);
  assert.doesNotMatch(source, /Number\(bet\.totalPrizeValue \|\| 0\)/);
});

test("checked bets preserve unavailable financial data instead of inventing zero", () => {
  assert.match(source, /financeiro indisponível/);
  assert.match(source, /rateio financeiro ainda não está disponível/);
  assert.match(source, /bet\.netResult === undefined \|\| bet\.netResult === null/);
  assert.match(source, /bet\.totalPrizeValue !== undefined && bet\.totalPrizeValue !== null/);
  assert.match(source, /item\.prizeValue === undefined \|\| item\.prizeValue === null \? "—"/);

  assert.match(fallbackSource, /formatCurrency\(bet\.totalPrizeValue\)/);
  assert.match(fallbackSource, /formatCurrency\(bet\.netResult\)/);
  assert.match(fallbackSource, /bet\.status === "checked" \? bet\.netResult : undefined/);
  assert.doesNotMatch(fallbackSource, /formatCurrency\(bet\.totalPrizeValue \|\| 0\)/);
  assert.doesNotMatch(fallbackSource, /formatCurrency\(bet\.netResult \|\| 0\)/);
  assert.doesNotMatch(fallbackSource, /bet\.status === "checked" \? \(bet\.netResult \|\| 0\) : undefined/);
});
