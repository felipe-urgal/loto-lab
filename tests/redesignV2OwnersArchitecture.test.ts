import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8").catch(async () =>
    readFile(path, "utf8"),
  );
}

test("generation keeps pure state and markup separate from the fetch lifecycle", async () => {
  const [controller, state, view] = await Promise.all([
    source("web/src/features/generationV2.ts"),
    source("web/src/features/generationV2/state.ts"),
    source("web/src/features/generationV2/view.ts"),
  ]);
  assert.match(controller, /generationV2\/state\.js/);
  assert.match(controller, /generationV2\/view\.js/);
  assert.match(controller, /AbortController/);
  assert.match(controller, /lifecycleToken/);
  assert.match(state, /export function requestPayload/);
  assert.doesNotMatch(state, /document\.|innerHTML|window\.|fetch\(/);
  assert.match(view, /escapeHtml/);
  assert.match(view, /export function workspaceMarkup/);
  assert.doesNotMatch(view, /AbortController|fetch\(/);
});

test("analysis views share existing types and the controller owns loading and bindings", async () => {
  const controller = await source("web/src/features/analysisV2.ts");
  assert.match(controller, /analysisV2\/shell\.js/);
  assert.match(controller, /renderToken/);
  assert.match(controller, /bindShellInteractions/);
  for (const module of ["map", "structure", "audit", "shell"]) {
    const view = await source(`web/src/features/analysisV2/${module}.ts`);
    assert.match(view, /\.\/types\.js/);
    assert.doesNotMatch(view, /api\(|currentMainView\(|document\.querySelector/);
  }
});

test("lottery preference storage has a single owner and retains existing key", async () => {
  const helper = await source("web/src/core/lotteryPreference.ts");
  assert.match(helper, /loto-lab:lottery/);
  assert.match(helper, /isLotteryId/);
  for (const module of ["core/shell", "features/lab", "features/dashboardScope"]) {
    const text = await source(`web/src/${module}.ts`);
    assert.match(text, /lotteryPreference\.js/);
    assert.doesNotMatch(text, /localStorage\.(?:getItem|setItem|removeItem)\(["']loto-lab:lottery/);
  }
});
