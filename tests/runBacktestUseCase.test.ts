import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, LotteryId } from "../src/domain/types.js";
import {
  BacktestRoundLimitError,
  RunBacktestUseCase,
  type BacktestHistoryReader,
  type BacktestStore,
  type SaveApplicationBacktestInput,
} from "../src/application/runBacktest.js";

function makeHistory(lottery: LotteryId, count: number): Contest[] {
  const specs = lottery === "mega-sena"
    ? { base: 2600, drawSize: 6, max: 60, step: 7 }
    : lottery === "lotofacil"
      ? { base: 3400, drawSize: 15, max: 25, step: 7 }
      : { base: 1100, drawSize: 7, max: 31, step: 5 };

  return Array.from({ length: count }, (_, offset) => ({
    lottery,
    number: specs.base + offset,
    date: `2026-01-${String((offset % 28) + 1).padStart(2, "0")}`,
    numbers: Array.from(
      { length: specs.drawSize },
      (_, index) => ((offset * 3 + index * specs.step) % specs.max) + 1,
    ).sort((a, b) => a - b),
    ...(lottery === "dia-de-sorte" ? { luckyMonth: "Janeiro" } : {}),
  }));
}

function historyReader(contests: Contest[]): BacktestHistoryReader {
  return {
    async list() {
      return contests;
    },
  };
}

function store(saved: SaveApplicationBacktestInput[] = []): BacktestStore {
  return {
    async save(input) {
      saved.push(input);
      return {
        ...input,
        id: 77,
        createdAt: "2026-08-30T00:00:00.000Z",
      };
    },
  };
}

test("RunBacktestUseCase blocks oversized HTTP backtests before running the engine", async () => {
  const contests = makeHistory("mega-sena", 521);
  let saves = 0;
  const useCase = new RunBacktestUseCase(historyReader(contests), {
    async save(input) {
      saves += 1;
      return { ...input, id: 1, createdAt: "2026-08-30T00:00:00.000Z" };
    },
  });

  await assert.rejects(
    () => useCase.execute({
      lottery: "mega-sena",
      gameCount: 1,
      warmupContests: 20,
      persist: false,
    }),
    (error: unknown) => {
      assert.ok(error instanceof BacktestRoundLimitError);
      assert.equal(error.requested, 501);
      assert.equal(error.maximum, 500);
      return true;
    },
  );
  assert.equal(saves, 0);
});

test("RunBacktestUseCase executes a scoped Mega-Sena backtest without persistence", async () => {
  const useCase = new RunBacktestUseCase(historyReader(makeHistory("mega-sena", 25)), store());

  const result = await useCase.execute({
    lottery: "mega-sena",
    gameCount: 2,
    warmupContests: 20,
    startContest: 2620,
    endContest: 2622,
    persist: false,
  });

  assert.equal(result.id, undefined);
  assert.equal(result.roundCount, 3);
  assert.equal(result.summary.testedContests, 3);
  assert.deepEqual(result.options, {
    gameCount: 2,
    warmupContests: 20,
    startContest: 2620,
    endContest: 2622,
  });
});

test("RunBacktestUseCase persists compact Lotofácil artifacts and the default fixed count", async () => {
  const saved: SaveApplicationBacktestInput[] = [];
  const useCase = new RunBacktestUseCase(historyReader(makeHistory("lotofacil", 22)), store(saved));

  const result = await useCase.execute({
    lottery: "lotofacil",
    gameCount: 1,
    warmupContests: 20,
    persist: true,
  });

  assert.equal(result.id, 77);
  assert.equal(result.roundCount, 2);
  assert.equal(result.options.fixedCount, 8);
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.rounds.length, 2);
  const allowedKeys = new Set(["contest", "date", "targetNumbers", "hitsByGame", "bestHits", "fixedHits"]);
  for (const round of saved[0]?.rounds ?? []) {
    assert.ok(Array.isArray(round.targetNumbers));
    assert.equal(typeof round.bestHits, "number");
    assert.equal(typeof round.fixedHits, "number");
    assert.ok(Object.keys(round).every((key) => allowedKeys.has(key)));
    assert.equal("generatedGames" in round, false);
    assert.equal("checks" in round, false);
  }
});

test("RunBacktestUseCase keeps Dia de Sorte on its dedicated engine", async () => {
  const useCase = new RunBacktestUseCase(historyReader(makeHistory("dia-de-sorte", 22)), store());

  const result = await useCase.execute({
    lottery: "dia-de-sorte",
    gameCount: 1,
    warmupContests: 20,
    persist: false,
  });

  assert.equal(result.roundCount, 2);
  assert.equal(result.summary.testedContests, 2);
  assert.equal("fixedCount" in result.options, false);
});
