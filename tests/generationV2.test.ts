import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, GeneratedGame } from "../src/domain/types.js";
import type { LotoLabApiServices } from "../src/api/services.js";
import type { GenerationPreviewRecord, SaveGenerationPreviewInput } from "../src/persistence/types.js";
import { runGenerationV2 } from "../src/api/generationV2.js";

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

function fakeServices(source: () => Contest[]) {
  const previews = new Map<string, GenerationPreviewRecord>();
  const batches = new Map<string, { id: number; games: GeneratedGame[]; generatorOptions: Record<string, unknown>; targetContestNumber?: number }>();
  let nextBatchId = 1;

  const services = {
    contests: {
      listGenerationHistory: async () => source(),
    },
    games: {
      deleteExpiredGenerationPreviews: async () => 0,
      saveGenerationPreview: async (input: SaveGenerationPreviewInput) => {
        const record: GenerationPreviewRecord = {
          ...input,
          createdAt: "2026-08-21T12:00:00.000Z",
          expiresAt: "2026-08-22T12:00:00.000Z",
        };
        previews.set(`${input.lottery}:${input.seed}`, record);
        return record;
      },
      findGenerationPreview: async (lottery: string, seed: string) => previews.get(`${lottery}:${seed}`),
      saveBatchIdempotent: async (input: { games: GeneratedGame[]; generatorOptions?: Record<string, unknown>; targetContestNumber?: number }, key: string) => {
        const existing = batches.get(key);
        if (existing) {
          return {
            created: false,
            batch: {
              id: existing.id,
              lottery: "mega-sena" as const,
              ...(existing.targetContestNumber !== undefined ? { targetContestNumber: existing.targetContestNumber } : {}),
              generatorOptions: existing.generatorOptions,
              createdAt: "2026-08-21T12:00:00.000Z",
              hasRealBet: false,
              games: existing.games,
            },
          };
        }
        const stored = {
          id: nextBatchId++,
          games: input.games,
          generatorOptions: input.generatorOptions ?? {},
          ...(input.targetContestNumber !== undefined ? { targetContestNumber: input.targetContestNumber } : {}),
        };
        batches.set(key, stored);
        return {
          created: true,
          batch: {
            id: stored.id,
            lottery: "mega-sena" as const,
            ...(stored.targetContestNumber !== undefined ? { targetContestNumber: stored.targetContestNumber } : {}),
            generatorOptions: stored.generatorOptions,
            createdAt: "2026-08-21T12:00:00.000Z",
            hasRealBet: false,
            games: stored.games,
          },
        };
      },
    },
  };

  return services as unknown as LotoLabApiServices;
}

test("Generator 2.0 saves the frozen preview exactly and is idempotent", async () => {
  let contests = megaHistory();
  const services = fakeServices(() => contests);
  const input = {
    lottery: "mega-sena" as const,
    gameCount: 2,
    fixedCount: 3,
    targetContestNumber: 31,
    generationMode: "diversified" as const,
    fixedNumbers: [1],
    excludedNumbers: [60],
  };

  const preview = await runGenerationV2(services, { ...input, persist: false });
  const seed = preview.generatorOptions.seed;
  assert.equal(typeof seed, "string");
  assert.ok(preview.preview.id.length === 64);

  const firstSave = await runGenerationV2(services, { ...input, seed: String(seed), persist: true }) as {
    alreadySaved: boolean;
    batchId: number;
    games: GeneratedGame[];
  };
  assert.equal(firstSave.alreadySaved, false);
  assert.equal(fingerprint(firstSave.games), fingerprint(preview.games));

  const secondSave = await runGenerationV2(services, { ...input, seed: String(seed), persist: true }) as {
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
    () => runGenerationV2(services, { ...input, seed: String(seed), persist: true }),
    (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "PREVIEW_STALE"),
  );
});
