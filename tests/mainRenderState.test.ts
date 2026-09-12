import assert from "node:assert/strict";
import test from "node:test";
import {
  createMainRenderState,
  lotteryFromStoredValue,
} from "../web/src/core/mainRenderState.js";

test("main render state normalizes initial view and lottery", () => {
  const state = createMainRenderState("#unknown", "invalid-lottery");

  assert.equal(state.view, "dashboard");
  assert.equal(state.lottery, "mega-sena");
  assert.equal(state.loading, false);
  assert.equal(lotteryFromStoredValue("lotofacil"), "lotofacil");
});

test("starting a new render aborts the previous snapshot and rejects stale completion", () => {
  const state = createMainRenderState("#analysis", "lotofacil");
  const first = state.beginRender();
  const second = state.beginRender();

  assert.equal(first.token, 1);
  assert.equal(first.view, "analysis");
  assert.equal(first.lottery, "lotofacil");
  assert.equal(first.signal.aborted, true);
  assert.equal(second.token, 2);
  assert.equal(second.signal.aborted, false);
  assert.equal(state.loading, true);
  assert.equal(state.isCurrentRender(first), false);
  assert.equal(state.isCurrentRender(second), true);
  assert.equal(state.finishRender(first), false);
  assert.equal(state.loading, true);
  assert.equal(state.finishRender(second), true);
  assert.equal(state.loading, false);
});

test("view or lottery changes invalidate an in-flight render snapshot", () => {
  const state = createMainRenderState("#dashboard", "mega-sena");
  const render = state.beginRender();

  state.view = "games";
  assert.equal(state.isCurrentRender(render), false);

  state.view = "dashboard";
  state.lottery = "dia-de-sorte";
  assert.equal(state.isCurrentRender(render), false);
});
