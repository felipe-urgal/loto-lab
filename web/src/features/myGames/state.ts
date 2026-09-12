import type { MyGamesFilter } from "./types.js";

export type MyGamesUiSnapshot = {
  filter: MyGamesFilter;
  query: string;
  expandedBatchId: number | null;
};

export type MyGamesUiState = {
  snapshot(): MyGamesUiSnapshot;
  setFilter(filter: MyGamesFilter): void;
  setQuery(query: string): void;
  toggleExpanded(batchId: number): void;
  setExpanded(batchId: number | null): void;
  resetForLotteryChange(): void;
  beginRequest(): number;
  isCurrentRequest(token: number): boolean;
};

export function createMyGamesUiState(): MyGamesUiState {
  let filter: MyGamesFilter = "visible";
  let query = "";
  let expandedBatchId: number | null = null;
  let requestToken = 0;

  return {
    snapshot() {
      return { filter, query, expandedBatchId };
    },
    setFilter(nextFilter) {
      filter = nextFilter;
    },
    setQuery(nextQuery) {
      query = nextQuery;
    },
    toggleExpanded(batchId) {
      expandedBatchId = expandedBatchId === batchId ? null : batchId;
    },
    setExpanded(batchId) {
      expandedBatchId = batchId;
    },
    resetForLotteryChange() {
      filter = "visible";
      query = "";
      expandedBatchId = null;
      requestToken += 1;
    },
    beginRequest() {
      requestToken += 1;
      return requestToken;
    },
    isCurrentRequest(token) {
      return token === requestToken;
    },
  };
}
