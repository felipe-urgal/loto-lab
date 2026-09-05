import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(path: string): Promise<string> {
  return readFile(path, "utf8");
}

test("Analysis next steps reuse canonical routes without cross-feature state or controller duplication", async () => {
  const [boundary, journey] = await Promise.all([
    source("web/analysis-v2.js"),
    source("web/src/features/analysisV2/journey.ts"),
  ]);

  assert.match(boundary, /src\/features\/analysisV2\.js/);
  assert.match(boundary, /src\/features\/analysisV2\/journey\.js/);

  assert.match(journey, /actionLink\("\/lab", "Experimentar no Laboratório"\)/);
  assert.match(journey, /actionLink\("\/#generate", "Gerar jogos"\)/);
  assert.match(journey, /currentMainView/);
  assert.match(journey, /onViewRendered/);
  assert.match(journey, /onMainViewChanged/);
  assert.match(journey, /new MutationObserver/);
  assert.match(journey, /observer\?\.disconnect\(\)/);

  assert.doesNotMatch(journey, /innerHTML/);
  assert.doesNotMatch(journey, /URLSearchParams|localStorage|sessionStorage/);
  assert.doesNotMatch(journey, /fetch\(|api\(/);
});
