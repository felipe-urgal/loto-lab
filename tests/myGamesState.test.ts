import assert from "node:assert/strict";
import test from "node:test";
import { createMyGamesUiState } from "../web/src/features/myGames/state.js";

test("My Games state owns filters, search and expansion without exposing mutable internals", () => {
  const state = createMyGamesUiState();

  assert.deepEqual(state.snapshot(), {
    filter: "visible",
    query: "",
    expandedBatchId: null,
  });

  state.setFilter("bets");
  state.setQuery("3001");
  state.toggleExpanded(41);
  assert.deepEqual(state.snapshot(), {
    filter: "bets",
    query: "3001",
    expandedBatchId: 41,
  });

  const snapshot = state.snapshot();
  snapshot.query = "mutated outside";
  assert.equal(state.snapshot().query, "3001");

  state.toggleExpanded(41);
  assert.equal(state.snapshot().expandedBatchId, null);
  state.setExpanded(9);
  assert.equal(state.snapshot().expandedBatchId, 9);
});

test("My Games state resets view context on lottery change", () => {
  const state = createMyGamesUiState();
  state.setFilter("hidden");
  state.setQuery("lote");
  state.setExpanded(12);

  state.resetForLotteryChange();
  assert.deepEqual(state.snapshot(), {
    filter: "visible",
    query: "",
    expandedBatchId: null,
  });
});

test("My Games state invalidates stale requests through opaque tokens", () => {
  const state = createMyGamesUiState();
  const first = state.beginRequest();
  assert.equal(state.isCurrentRequest(first), true);

  const second = state.beginRequest();
  assert.equal(state.isCurrentRequest(first), false);
  assert.equal(state.isCurrentRequest(second), true);
});
