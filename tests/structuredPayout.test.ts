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

import { normalizeCaixaContest } from "../src/data/caixa.js";

test("normalized CAIXA-shaped +Milionaria tiers resolve a prize without inventing missing tiers", () => {
  const payload = {
    numero: 900001,
    dataApuracao: "01/01/2099",
    listaDezenas: ["01", "02", "03", "04", "05", "06"],
    trevosSorteados: ["1", "2"],
    listaRateioPremio: Array.from({ length: 10 }, (_, i) => ({
      descricaoFaixa: `Faixa ${i + 1}`, faixa: i + 1,
      numeroDeGanhadores: 1, valorPremio: 100 * (i + 1),
    })),
  };
  const game: GeneratedGame = {
    lottery: "mais-milionaria", numbers: [1,2,3,4,5,6],
    fixedNumbers: [], variableNumbers: [1,2,3,4,5,6],
    secondary: { kind: "clovers", values: [1,2] }, metadata,
  };
  const normalized = normalizeCaixaContest("mais-milionaria", payload);
  assert.equal(hasCompletePrizeSchedule(normalized), true);
  assert.equal(evaluateGame(game, normalized).totalPrizeValue, 100);
  const incomplete = normalizeCaixaContest("mais-milionaria", {
    ...payload, listaRateioPremio: payload.listaRateioPremio.slice(1),
  });
  assert.equal(hasCompletePrizeSchedule(incomplete), false);
  assert.equal(evaluateGame(game, incomplete).totalPrizeValue, undefined);
});

test("normalized CAIXA-shaped Timemania handles secondary-only, combined, and unknown team payout", () => {
  const payload = {
    numero: 900001, dataApuracao: "01/01/2099",
    listaDezenas: ["01","02","03","04","05","06","07"],
    nomeTimeCoracaoMesSorte: "SANTOS",
    listaRateioPremio: [
      ...[3,4,5,6,7].map(h => ({
        descricaoFaixa: `${h} acertos`, numeroDeGanhadores: 1, valorPremio: h * 10,
      })),
      { descricaoFaixa: "Time do Coração", numeroDeGanhadores: 1, valorPremio: 15 },
    ],
  };
  const normalized = normalizeCaixaContest("timemania", payload);
  const game: GeneratedGame = {
    lottery: "timemania", numbers: [1,2,8,9,10,11,12,13,14,15],
    fixedNumbers: [], variableNumbers: [1,2,8,9,10,11,12,13,14,15],
    secondary: { kind: "favorite-team", values: ["SANTOS"] }, metadata,
  };
  assert.equal(hasCompletePrizeSchedule(normalized), true);
  assert.equal(evaluateGame(game, normalized).totalPrizeValue, 15);
  assert.equal(evaluateGame({ ...game, numbers: [1,2,3,9,10,11,12,13,14,15], variableNumbers: [1,2,3,9,10,11,12,13,14,15] }, normalized).totalPrizeValue, 45);
  assert.equal(evaluateGame({ ...game, secondary: { kind: "favorite-team", values: ["OUTRO"] } }, normalized).totalPrizeValue, 0);
  const missingTeam = normalizeCaixaContest("timemania", {
    ...payload, listaRateioPremio: payload.listaRateioPremio.slice(0,5),
  });
  assert.equal(hasCompletePrizeSchedule(missingTeam), false);
  assert.equal(evaluateGame(game, missingTeam).totalPrizeValue, undefined);
});

test("normalized CAIXA-shaped Super Sete resolves official column matches", () => {
  const payload = {
    numero: 900001, dataApuracao: "01/01/2099",
    listaDezenas: ["1","2","3","4","5","6","7"],
    listaRateioPremio: [3,4,5,6,7].map(h => ({
      descricaoFaixa: `${h} acertos`, numeroDeGanhadores: 1, valorPremio: h * 100,
    })),
  };
  const game: GeneratedGame = {
    lottery: "super-sete", numbers: [], fixedNumbers: [], variableNumbers: [],
    columns: [[1],[2],[3],[4],[0],[0],[0]], metadata,
  };
  const normalized = normalizeCaixaContest("super-sete", payload);
  assert.equal(hasCompletePrizeSchedule(normalized), true);
  assert.equal(evaluateGame(game, normalized).totalPrizeValue, 400);
  const incomplete = normalizeCaixaContest("super-sete", {
    ...payload, listaRateioPremio: payload.listaRateioPremio.filter(t => t.descricaoFaixa !== "4 acertos"),
  });
  assert.equal(hasCompletePrizeSchedule(incomplete), false);
  assert.equal(evaluateGame(game, incomplete).totalPrizeValue, undefined);
});
