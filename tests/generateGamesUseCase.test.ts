import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, GeneratedGame, LotteryId } from "../src/domain/types.js";
import { generateMegaSenaGames } from "../src/generator/megaSena.js";
import {
  GenerateGamesUseCase,
  InsufficientGenerationHistoryError,
  type GeneratedBatchStore,
  type GenerationHistoryReader,
} from "../src/application/generateGames.js";
import type {
  ApplicationGameBatch,
  SaveApplicationGameBatchInput,
} from "../src/application/gameBatch.js";

function makeHistory(lottery: LotteryId, count = 25): Contest[] {
  const specs = lottery === "mega-sena"
    ? { base: 2600, drawSize: 6, max: 60, step: 7 }
    : lottery === "lotofacil"
      ? { base: 3400, drawSize: 15, max: 25, step: 7 }
      : { base: 1100, drawSize: 7, max: 31, step: 5 };

  return Array.from({ length: count }, (_, offset) => ({
    lottery,
    number: specs.base + offset,
    date: `2026-01-${String(offset + 1).padStart(2, "0")}`,
    numbers: Array.from(
      { length: specs.drawSize },
      (_, index) => ((offset * 3 + index * specs.step) % specs.max) + 1,
    ).sort((a, b) => a - b),
    ...(lottery === "dia-de-sorte" ? { luckyMonth: "Janeiro" } : {}),
  }));
}

function fingerprint(games: GeneratedGame[]): string {
  return games
    .map((game) => `${game.numbers.join("-")}:${game.luckyMonth ?? ""}`)
    .sort()
    .join("|");
}

function historyReader(contests: Contest[], requested: Array<{ lottery: LotteryId; order: "asc" }>): GenerationHistoryReader {
  return {
    async list(options) {
      requested.push(options);
      return contests;
    },
  };
}

function batchStore(options: {
  recent?: ApplicationGameBatch[];
  saved?: SaveApplicationGameBatchInput[];
} = {}): GeneratedBatchStore {
  return {
    async listRecent() {
      return options.recent ?? [];
    },
    async saveBatch(input) {
      options.saved?.push(input);
      return {
        id: 99,
        lottery: input.lottery,
        ...(input.targetContestNumber !== undefined ? { targetContestNumber: input.targetContestNumber } : {}),
        generatorOptions: input.generatorOptions ?? {},
        createdAt: "2026-08-30T00:00:00.000Z",
        hasRealBet: false,
        games: input.games,
      };
    },
  };
}

test("GenerateGamesUseCase rejects a target whose pre-target history is below the minimum", async () => {
  const contests = makeHistory("mega-sena");
  const requested: Array<{ lottery: LotteryId; order: "asc" }> = [];
  const useCase = new GenerateGamesUseCase(historyReader(contests, requested), batchStore());

  await assert.rejects(
    () => useCase.execute({
      lottery: "mega-sena",
      gameCount: 1,
      targetContestNumber: 2619,
      persist: false,
    }),
    (error: unknown) => {
      assert.ok(error instanceof InsufficientGenerationHistoryError);
      assert.equal(error.available, 19);
      assert.equal(error.required, 20);
      return true;
    },
  );
  assert.deepEqual(requested, [{ lottery: "mega-sena", order: "asc" }]);
});

test("GenerateGamesUseCase replays an explicit seed without reading or writing persisted batches", async () => {
  const contests = makeHistory("mega-sena");
  let recentReads = 0;
  let saves = 0;
  const store: GeneratedBatchStore = {
    async listRecent() {
      recentReads += 1;
      return [];
    },
    async saveBatch() {
      saves += 1;
      throw new Error("saveBatch should not be called for a replay");
    },
  };
  const useCase = new GenerateGamesUseCase(historyReader(contests, []), store);

  const result = await useCase.execute({
    lottery: "mega-sena",
    gameCount: 2,
    targetContestNumber: 2624,
    generationMode: "diversified",
    seed: "replay-seed",
    persist: false,
  });

  assert.equal(recentReads, 0);
  assert.equal(saves, 0);
  assert.equal(result.targetContestNumber, 2624);
  assert.equal(result.games.length, 2);
  assert.deepEqual(result.generatorOptions, {
    gameCount: 2,
    generationMode: "diversified",
    seed: "replay-seed",
  });
});

test("GenerateGamesUseCase retries a duplicate diversified batch with a fresh injected seed", async () => {
  const contests = makeHistory("mega-sena");
  const generationHistory = contests.filter((contest) => contest.number < 2624);
  const collidingGames = generateMegaSenaGames(generationHistory, {
    gameCount: 2,
    generationMode: "diversified",
    seed: "collision-seed",
  });
  const recent: ApplicationGameBatch[] = [{
    id: 10,
    lottery: "mega-sena",
    targetContestNumber: 2624,
    generatorOptions: { generationMode: "diversified", seed: "collision-seed" },
    createdAt: "2026-08-29T00:00:00.000Z",
    hasRealBet: false,
    games: collidingGames,
  }];
  const saved: SaveApplicationGameBatchInput[] = [];
  const seeds = ["collision-seed", "fresh-seed"];
  const useCase = new GenerateGamesUseCase(
    historyReader(contests, []),
    batchStore({ recent, saved }),
    () => seeds.shift() ?? "fallback-seed",
  );

  const result = await useCase.execute({
    lottery: "mega-sena",
    gameCount: 2,
    targetContestNumber: 2624,
    persist: true,
  });

  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.generatorOptions?.seed, "fresh-seed");
  assert.notEqual(fingerprint(saved[0]!.games), fingerprint(collidingGames));
  assert.equal(result.batchId, 99);
  assert.equal(result.generatorOptions.seed, "fresh-seed");
});

test("GenerateGamesUseCase keeps the Lotofácil fixed-core default in the application contract", async () => {
  const contests = makeHistory("lotofacil", 20);
  const useCase = new GenerateGamesUseCase(historyReader(contests, []), batchStore());

  const result = await useCase.execute({
    lottery: "lotofacil",
    gameCount: 1,
    generationMode: "deterministic",
    persist: false,
  });

  assert.equal(result.games.length, 1);
  assert.equal(result.games[0]?.fixedNumbers.length, 8);
  assert.deepEqual(result.generatorOptions, {
    gameCount: 1,
    generationMode: "deterministic",
    fixedCount: 8,
  });
});
