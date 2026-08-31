import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, GeneratedGame, LotteryId } from "../src/domain/types.js";
import {
  GenerationV2UseCase,
  type GenerationV2Preview,
  type SaveGenerationV2PreviewInput,
} from "../src/application/generationV2.js";
import { buildGenerationPlan } from "../src/generator/planning.js";

function megaHistory(count = 30): Contest[] {
  return Array.from({ length: count }, (_, index) => ({
    lottery: "mega-sena" as const,
    number: index + 1,
    date: `2026-${String((index % 9) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}`,
    numbers: Array.from({ length: 6 }, (_, offset) => ((index * 7 + offset * 11) % 60) + 1)
      .sort((a, b) => a - b),
  }));
}

function fingerprint(games: GeneratedGame[]): string {
  return games.map((game) => `${game.numbers.join("-")}:${game.luckyMonth ?? ""}`).sort().join("|");
}

function fakeUseCase(source: () => Contest[]): GenerationV2UseCase {
  const previews = new Map<string, GenerationV2Preview>();
  const batches = new Map<string, {
    id: number;
    lottery: LotteryId;
    games: GeneratedGame[];
    generatorOptions: Record<string, unknown>;
    targetContestNumber?: number;
  }>();
  let nextBatchId = 1;

  return new GenerationV2UseCase(
    {
      listGenerationHistory: async () => source(),
    },
    {
      deleteExpiredGenerationPreviews: async () => 0,
      saveGenerationPreview: async (input: SaveGenerationV2PreviewInput) => {
        const record: GenerationV2Preview = {
          ...input,
          createdAt: "2026-08-21T12:00:00.000Z",
          expiresAt: "2026-08-22T12:00:00.000Z",
        };
        previews.set(`${input.lottery}:${input.seed}`, record);
        return record;
      },
      findGenerationPreview: async (lottery, seed) => previews.get(`${lottery}:${seed}`),
      saveBatchIdempotent: async (input, key) => {
        const existing = batches.get(key);
        if (existing) {
          return {
            created: false,
            batch: {
              id: existing.id,
              lottery: existing.lottery,
              ...(existing.targetContestNumber !== undefined
                ? { targetContestNumber: existing.targetContestNumber }
                : {}),
              generatorOptions: existing.generatorOptions,
              createdAt: "2026-08-21T12:00:00.000Z",
              hasRealBet: false,
              games: existing.games,
            },
          };
        }
        const stored = {
          id: nextBatchId++,
          lottery: input.lottery,
          games: input.games,
          generatorOptions: input.generatorOptions ?? {},
          ...(input.targetContestNumber !== undefined
            ? { targetContestNumber: input.targetContestNumber }
            : {}),
        };
        batches.set(key, stored);
        return {
          created: true,
          batch: {
            id: stored.id,
            lottery: stored.lottery,
            ...(stored.targetContestNumber !== undefined
              ? { targetContestNumber: stored.targetContestNumber }
              : {}),
            generatorOptions: stored.generatorOptions,
            createdAt: "2026-08-21T12:00:00.000Z",
            hasRealBet: false,
            games: stored.games,
          },
        };
      },
    },
    async (contests, lottery, options) => buildGenerationPlan(contests, lottery, options),
  );
}

test("Generator 2.0 saves the frozen preview exactly and is idempotent", async () => {
  let contests = megaHistory();
  const useCase = fakeUseCase(() => contests);
  const input = {
    lottery: "mega-sena" as const,
    gameCount: 2,
    fixedCount: 3,
    targetContestNumber: 31,
    generationMode: "diversified" as const,
    fixedNumbers: [1],
    excludedNumbers: [60],
  };

  const preview = await useCase.execute({ ...input, persist: false });
  const seed = preview.generatorOptions.seed;
  assert.equal(typeof seed, "string");
  assert.ok(preview.preview.id.length === 64);

  const firstSave = await useCase.execute({ ...input, seed: String(seed), persist: true }) as {
    alreadySaved: boolean;
    batchId: number;
    games: GeneratedGame[];
  };
  assert.equal(firstSave.alreadySaved, false);
  assert.equal(fingerprint(firstSave.games), fingerprint(preview.games));

  const secondSave = await useCase.execute({ ...input, seed: String(seed), persist: true }) as {
    alreadySaved: boolean;
    batchId: number;
    games: GeneratedGame[];
  };
  assert.equal(secondSave.alreadySaved, true);
  assert.equal(secondSave.batchId, firstSave.batchId);
  assert.equal(fingerprint(secondSave.games), fingerprint(preview.games));

  contests = contests.map((contest) => contest.number === 10
    ? { ...contest, numbers: [1, 2, 3, 4, 5, 60] }
    : contest);
  await assert.rejects(
    () => useCase.execute({ ...input, seed: String(seed), persist: true }),
    (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "PREVIEW_STALE"),
  );
});
