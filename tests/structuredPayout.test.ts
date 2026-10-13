import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, GeneratedGame } from "../src/domain/types.js";
import { evaluateGame } from "../src/checker/evaluate.js";
import { hasCompletePrizeSchedule, resolvePrizeValue, structuredTierIndex } from "../src/finance/prizes.js";

const metadata = { odd: 0, even: 0, sum: 0, repeatedFromLastContest: [] };
const tier = (description: string, value: number) => ({ description, winners: 1, prizeValue: value });
const contest = (lottery: Contest["lottery"], prizeTiers: Contest["prizeTiers"]): Contest => ({
  lottery, number: 900001, date: "2099-01-01",
  numbers: lottery === "super-sete" ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6, 7],
  prizeTiers,
});

test("+Milionaria maps ten tiers, preserves missing schedules, and keeps official zero", () => {
  const tiers = Array.from({ length: 10 }, (_, i) => tier(`Faixa ${i + 1}`, (i + 1) * 100));
  const target = contest("mais-milionaria", tiers);
  assert.equal(hasCompletePrizeSchedule(target), true);
  assert.deepEqual(Array.from({ length: 10 }, (_, i) => structuredTierIndex(`Faixa ${i + 1}`)), [1,2,3,4,5,6,7,8,9,10]);
  assert.equal(resolvePrizeValue(target, 6, false, 1, { cloverHits: 2 }).totalPrizeValue, 100);
  assert.equal(resolvePrizeValue(target, 2, false, 1, { cloverHits: 1 }).totalPrizeValue, 1000);
  assert.equal(resolvePrizeValue(target, 1, false, 1, { cloverHits: 2 }).totalPrizeValue, 0);
  assert.equal(resolvePrizeValue(target, 6).totalPrizeValue, undefined);
  assert.equal(resolvePrizeValue({ ...target, prizeTiers: tiers.slice(1) }, 6, false, 1, { cloverHits: 2 }).totalPrizeValue, undefined);
  assert.equal(hasCompletePrizeSchedule({ ...target, prizeTiers: tiers.slice(1) }), false);
  assert.equal(resolvePrizeValue({ ...target, prizeTiers: [tier("Faixa 1", 0)] }, 6, false, 1, { cloverHits: 2 }).totalPrizeValue, 0);
});

test("Timemania totals number and Time do Coracao separately", () => {
  const target = { ...contest("timemania", [3,4,5,6,7].map(n => tier(`${n} acertos`, n * 10)).concat([tier("Time do Coração", 15)])), secondary: { kind: "favorite-team" as const, values: ["SANTOS"] } };
  assert.equal(hasCompletePrizeSchedule(target), true);
  const game: GeneratedGame = { lottery: "timemania", numbers: [1,2,8,9,10,11,12,13,14,15], fixedNumbers: [], variableNumbers: [1,2,8,9,10,11,12,13,14,15], secondary: { kind: "favorite-team", values: ["SANTOS"] }, metadata };
  assert.equal(evaluateGame(game, target).totalPrizeValue, 15);
  const combined = { ...game, numbers: [1,2,3,9,10,11,12,13,14,15], variableNumbers: [1,2,3,9,10,11,12,13,14,15] };
  assert.equal(evaluateGame(combined, target).totalPrizeValue, 45);
  assert.equal(evaluateGame({ ...game, secondary: { kind: "favorite-team", values: ["OUTRO"] } }, target).totalPrizeValue, 0);
  assert.equal(evaluateGame(game, { ...target, prizeTiers: target.prizeTiers?.slice(0,5) }).totalPrizeValue, undefined);
});

test("Super Sete resolves payout after comparing ordered columns", () => {
  const target = { ...contest("super-sete", [3,4,5,6,7].map(n => tier(`${n} acertos`, n * 100))), columns: [1,2,3,4,5,6,7] };
  assert.equal(hasCompletePrizeSchedule(target), true);
  const game: GeneratedGame = { lottery: "super-sete", numbers: [], fixedNumbers: [], variableNumbers: [], columns: [[1],[2],[3],[4],[0],[0],[0]], metadata };
  const result = evaluateGame(game, target);
  assert.equal(result.hits, 4);
  assert.equal(result.totalPrizeValue, 400);
  assert.equal(evaluateGame(game, { ...target, prizeTiers: target.prizeTiers?.filter(t => t.description !== "4 acertos") }).totalPrizeValue, undefined);
  assert.equal(hasCompletePrizeSchedule({ ...target, prizeTiers: target.prizeTiers?.filter(t => t.description !== "4 acertos") }), false);
  assert.equal(evaluateGame({ ...game, columns: [[0],[0],[0],[0],[0],[0],[0]] }, target).totalPrizeValue, 0);
});
