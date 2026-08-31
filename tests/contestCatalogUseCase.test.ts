import test from "node:test";
import assert from "node:assert/strict";
import type { Contest } from "../src/domain/types.js";
import {
  ContestCatalogUseCase,
  type ContestCatalogReader,
  type ContestListQuery,
} from "../src/application/contestCatalog.js";

const contests: Contest[] = [
  {
    lottery: "mega-sena",
    number: 3000,
    date: "2026-08-27",
    numbers: [1, 2, 3, 4, 5, 6],
  },
  {
    lottery: "mega-sena",
    number: 3001,
    date: "2026-08-29",
    numbers: [7, 8, 9, 10, 11, 12],
  },
];

function reader(): ContestCatalogReader & { queries: ContestListQuery[] } {
  const queries: ContestListQuery[] = [];
  return {
    queries,
    async findByNumber(lottery, contestNumber) {
      return contests.find((contest) => contest.lottery === lottery && contest.number === contestNumber);
    },
    async list(query) {
      queries.push(query);
      return contests.filter((contest) => contest.lottery === query.lottery);
    },
  };
}

test("contest catalog resolves the latest contest through the reader port", async () => {
  const store = reader();
  const catalog = new ContestCatalogUseCase(store);

  const latest = await catalog.latest("mega-sena");

  assert.equal(latest?.number, 3000);
  assert.deepEqual(store.queries, [{ lottery: "mega-sena", order: "desc", limit: 1 }]);
});

test("contest catalog delegates find and list queries without persistence knowledge", async () => {
  const store = reader();
  const catalog = new ContestCatalogUseCase(store);

  assert.equal((await catalog.findByNumber("mega-sena", 3001))?.number, 3001);

  const query: ContestListQuery = {
    lottery: "mega-sena",
    startContest: 2990,
    endContest: 3010,
    limit: 25,
    order: "asc",
  };
  const listed = await catalog.list(query);

  assert.equal(listed.length, 2);
  assert.deepEqual(store.queries, [query]);
});
