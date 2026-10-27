import test from "node:test";
import assert from "node:assert/strict";
import { gamesToText } from "../web/src/features/generationV2/view.js";
import { recentContestsMarkup } from "../web/src/features/generatorPresentation.js";
import type { GeneratedGame } from "../web/src/features/generationV2/types.js";

const game: GeneratedGame = { lottery: "mega-sena", numbers: [7, 12, 18, 29, 42, 56], fixedNumbers: [7, 18], variableNumbers: [12, 29, 42, 56], metadata: { odd: 2, even: 4, sum: 164, repeatedFromLastContest: [] } };

test("copy output contains the exact generated numbers and secondary fields", () => {
  assert.equal(gamesToText([game]), "Jogo 01: 07 12 18 29 42 56");
  assert.equal(gamesToText([{ ...game, lottery: "dia-de-sorte", secondary: { kind: "lucky-month", values: ["Janeiro"] } }]), "Jogo 01: 07 12 18 29 42 56 | Janeiro");
  assert.equal(gamesToText([{ ...game, lottery: "super-sete", numbers: [], columns: [[0], [1, 3], [2], [3], [4], [5], [6]] }]), "Jogo 01: C1: 0 | C2: 1, 3 | C3: 2 | C4: 3 | C5: 4 | C6: 5 | C7: 6");
});

test("recent results show every given contest and preserve zero and two draws", () => {
  const items = [4, 3, 2, 1].map(number => ({ number, date: "2026-10-20", numbers: [0, 7] }));
  const html = recentContestsMarkup(items);
  assert.equal((html.match(/class="recent-row"/g) || []).length, 4);
  assert.match(html, />00<\/span>/);
  assert.match(html, /Concurso #1</);
  assert.match(recentContestsMarkup([{ ...items[0]!, secondDrawNumbers: [1, 2] }]), /2º sorteio/);
  assert.match(recentContestsMarkup([{ ...items[0]!, secondary: { kind: "favorite-team", values: ["<script>"] } }]), /&lt;script&gt;/);
  assert.match(recentContestsMarkup([]), /Ainda não há resultados/);
});
