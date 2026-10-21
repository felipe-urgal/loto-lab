import test from "node:test";
import assert from "node:assert/strict";
import { buildGenerationPlan } from "../src/generator/planning.js";
import { workspaceMarkup, gameMarkup } from "../web/src/features/generationV2/view.js";
import type { GeneratorState } from "../web/src/features/generationV2/types.js";

function state(): GeneratorState {
  const plan = buildGenerationPlan([], "mega-sena");
  return {
    lottery: "mega-sena",
    lotteryConfig: { id: "mega-sena", name: "Mega-Sena", minNumber: 1, maxNumber: 60, drawSize: 6, defaultBetSize: 6, enabled: true },
    lotteryCatalog: [{ id: "mega-sena", name: "Mega-Sena", minNumber: 1, maxNumber: 60, drawSize: 6, defaultBetSize: 6, enabled: true }],
    plan, gameCount: 2, fixedCount: 3, betSize: 6,
    fixed: new Set([7, 18]), excluded: new Set([31]), selectionMode: "fix", purpose: "uniform",
    filters: { odd: { enabled: false, min: 0, max: 6 }, repeated: { enabled: false, min: 0, max: 6 }, sum: { enabled: false, min: 0, max: 360 } },
    preview: null, controller: new AbortController(), cloverCount: 2, favoriteTeam: "", columnMarks: Array(7).fill(1), coveragePool: new Set<number>(), coverageTargetSize: 5, cleanup: null,
  } as GeneratorState;
}

test("direct generator keeps customization optional and has no saving or financial UI", () => {
  const html = workspaceMarkup(state());
  assert.match(html, /Personalizar dezenas e filtros/);
  assert.match(html, /Gerar jogos/);
  assert.match(html, /id="lottery-select"/);
  assert.doesNotMatch(html, /data-g2-save|data-g2-flow-step|Custo|Orçamento|R\$|Forte histórica|Fria histórica/);
  assert.match(html, /data-g2-result/);
});

test("manual number controls communicate fixed and excluded choices without historical ranking", () => {
  const html = workspaceMarkup(state());
  assert.match(html, /data-g2-number="7"[^>]*aria-label="Dezena 07: fixada"/);
  assert.match(html, /data-g2-number="31"[^>]*aria-label="Dezena 31: excluída"/);
  assert.doesNotMatch(html, /class="g2-number[^\"]*is-(strong|balanced|cold)/);
});

test("generated structured games retain positional columns and secondary selections", () => {
  const game = gameMarkup({ lottery: "super-sete", numbers: [], fixedNumbers: [], variableNumbers: [], columns: [[0], [1], [2], [3], [4], [5], [6]], metadata: { odd: 0, even: 0, sum: 0, repeatedFromLastContest: [] } }, 0);
  assert.match(game, /C1:0/);
  assert.match(game, /C7:6/);
  const timemania = gameMarkup({ lottery: "timemania", numbers: [1], fixedNumbers: [], variableNumbers: [1], secondary: { kind: "favorite-team", values: ["<Time>"] }, metadata: { odd: 1, even: 0, sum: 1, repeatedFromLastContest: [] } }, 0);
  assert.match(timemania, /&lt;Time&gt;/);
});
