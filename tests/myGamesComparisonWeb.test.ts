import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const [boundary, presentation, comparison, formatting, betForm] = await Promise.all([
  readFile(resolve(process.cwd(), "web/my-games-v2.js"), "utf8"),
  readFile(resolve(process.cwd(), "web/src/features/myGames/presentation.ts"), "utf8"),
  readFile(resolve(process.cwd(), "web/src/features/myGames/comparison.ts"), "utf8"),
  readFile(resolve(process.cwd(), "web/src/features/myGames/formatting.ts"), "utf8"),
  readFile(resolve(process.cwd(), "web/src/features/myGames/betForm.ts"), "utf8"),
]);
const source = [presentation, comparison, formatting, betForm].join("\n");

test("My Games keeps exploratory comparison separate from real financial accounting", () => {
  assert.equal(boundary.trim(), 'import "./src/features/myGames.js";');
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
  assert.match(formatting, /typeof value === "number" && Number\.isFinite\(value\)/);
  assert.doesNotMatch(formatting, /Number\(value\)/);
  assert.match(betForm, /api\("\/real-bets"/);
  assert.doesNotMatch(betForm, /actualCost\s*\|\|\s*0/);
});
