import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("advanced analysis delegates associations to a focused owner", async () => {
  const [advanced, associations] = await Promise.all([
    readFile("src/analysis/advanced.ts", "utf8"),
    readFile("src/analysis/associations.ts", "utf8"),
  ]);

  assert.match(advanced, /import \{ buildAssociations \} from "\.\/associations\.js"/);
  assert.match(advanced, /combinations: buildAssociations\(scoped, config\)/);
  assert.doesNotMatch(advanced, /function pairKey\(/);
  assert.doesNotMatch(advanced, /function tripleKey\(/);
  assert.doesNotMatch(advanced, /function associationStat\(/);
  assert.doesNotMatch(advanced, /function buildAssociations\(/);
  assert.doesNotMatch(advanced, /interface AssociationStat/);
  assert.doesNotMatch(advanced, /interface PairStat/);
  assert.doesNotMatch(advanced, /interface TripleStat/);

  assert.match(associations, /export function buildAssociations\(/);
  assert.match(associations, /from "\.\/frequency\.js"/);
  assert.match(associations, /from "\.\/statistics\.js"/);
  assert.doesNotMatch(associations, /continuity\.js|scoring\.js|structure\.js/);
  assert.doesNotMatch(associations, /buildAdvancedAnalysis/);
});
