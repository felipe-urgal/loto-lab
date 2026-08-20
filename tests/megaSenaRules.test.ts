import test from "node:test";
import assert from "node:assert/strict";
import type { Contest } from "../src/domain/types.js";
import { generateMegaSenaGames } from "../src/generator/megaSena.js";
import {
  ARTICLE_RULES_GROUP_2,
  countPreferredGroup,
  hasConsecutiveNumbers,
  hasRepeatedColumn,
  matchesMegaSenaRules,
  representedQuadrants,
} from "../src/generator/megaSenaRules.js";

function history(count = 40): Contest[] {
  return Array.from({ length: count }, (_, index) => {
    const numbers: number[] = [];
    let cursor = (index * 7) % 60;
    while (numbers.length < 6) {
      const candidate = (cursor % 60) + 1;
      if (!numbers.includes(candidate)) numbers.push(candidate);
      cursor += 11;
    }
    return {
      lottery: "mega-sena",
      number: index + 1,
      date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
      numbers: numbers.sort((a, b) => a - b),
    };
  });
}

test("Mega-Sena rule helpers classify structural constraints", () => {
  const valid = [4, 16, 23, 29, 41, 58];
  assert.equal(countPreferredGroup(valid), 6);
  assert.equal(hasConsecutiveNumbers(valid), false);
  assert.equal(hasRepeatedColumn(valid), false);
  assert.equal(representedQuadrants(valid), 4);
  assert.equal(matchesMegaSenaRules(valid, ARTICLE_RULES_GROUP_2), true);

  assert.equal(hasConsecutiveNumbers([4, 5, 16, 29, 41, 58]), true);
  assert.equal(hasRepeatedColumn([4, 14, 23, 29, 41, 58]), true);
  assert.equal(matchesMegaSenaRules([1, 8, 19, 26, 35, 44], { minPreferredGroup: 2 }), false);
});

test("Mega-Sena generator applies experimental rules only when requested", () => {
  const contests = history();
  const baseline = generateMegaSenaGames(contests, { gameCount: 2, fixedCount: 0 });
  const filtered = generateMegaSenaGames(contests, {
    gameCount: 2,
    fixedCount: 0,
    rules: ARTICLE_RULES_GROUP_2,
  });

  assert.equal(baseline.length, 2);
  assert.equal(filtered.length, 2);
  assert.ok(filtered.every((game) => matchesMegaSenaRules(game.numbers, ARTICLE_RULES_GROUP_2)));
});
