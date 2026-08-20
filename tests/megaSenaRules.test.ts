import test from "node:test";
import assert from "node:assert/strict";
import {
  ARTICLE_RULES_GROUP_2,
  countPreferredGroup,
  hasConsecutiveNumbers,
  hasRepeatedColumn,
  matchesMegaSenaRules,
  representedQuadrants,
} from "../src/generator/megaSenaRules.js";

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
