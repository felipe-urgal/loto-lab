import { randomUUID } from "node:crypto";
import type { Contest, GeneratedGame, LotteryId } from "../domain/types.js";
import { generateDiaDeSorteGames } from "../generator/diaDeSorte.js";
import { generateLotofacilGames } from "../generator/lotofacil.js";
import { generateMegaSenaGames } from "../generator/megaSena.js";
import type { GenerationMode } from "../generator/shared.js";
import type { ApplicationGameBatch, SaveApplicationGameBatchInput } from "./gameBatch.js";

export const MIN_GENERATION_HISTORY = 20;

export class InsufficientGenerationHistoryError extends Error {
  constructor(
    readonly lottery: LotteryId,
    readonly available: number,
    readonly required = MIN_GENERATION_HISTORY,
  ) {
    super(`At least ${required} historical contests are required to generate games for ${lottery}; ${available} available`);
  }
}

export interface GenerateGamesRequest {
  lottery: LotteryId;
  gameCount: number;
  fixedCount?: 8 | 9 | 10;
  targetContestNumber?: number;
  generationMode?: GenerationMode;
  seed?: string;
  persist: boolean;
}

export interface GenerateGamesResponse {
  lottery: LotteryId;
  targetContestNumber?: number;
  batchId?: number;
  games: GeneratedGame[];
  generatorOptions: Record<string, unknown>;
}

export interface GenerationHistoryReader {
  list(options: { lottery: LotteryId; order: "asc" }): Promise<Contest[]>;
}

export interface GeneratedBatchStore {
  listRecent(lottery: LotteryId, limit?: number): Promise<ApplicationGameBatch[]>;
  saveBatch(input: SaveApplicationGameBatchInput): Promise<ApplicationGameBatch>;
}

function gameFingerprint(games: GeneratedGame[]): string {
  return games
    .map((game) => `${game.numbers.join("-")}:${game.luckyMonth ?? ""}`)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

export class GenerateGamesUseCase {
  constructor(
    private readonly history: GenerationHistoryReader,
    private readonly batches: GeneratedBatchStore,
    private readonly createSeed: () => string = randomUUID,
  ) {}

  async execute(input: GenerateGamesRequest): Promise<GenerateGamesResponse> {
    const contests = await this.history.list({ lottery: input.lottery, order: "asc" });
    const latestContest = contests.at(-1);
    const generationHistory = input.targetContestNumber === undefined
      ? contests
      : contests.filter((contest) => contest.number < input.targetContestNumber!);
    if (generationHistory.length < MIN_GENERATION_HISTORY) {
      throw new InsufficientGenerationHistoryError(input.lottery, generationHistory.length);
    }

    const targetContestNumber = input.targetContestNumber ??
      (latestContest ? latestContest.number + 1 : undefined);
    const generationMode = input.generationMode ?? "diversified";
    const fixedCount = input.lottery === "lotofacil" ? input.fixedCount ?? 8 : undefined;
    const recentBatches = input.persist && generationMode === "diversified" && input.seed === undefined
      ? await this.batches.listRecent(input.lottery, 100)
      : [];
    const existingFingerprints = new Set(
      recentBatches
        .filter((batch) => batch.targetContestNumber === targetContestNumber)
        .map((batch) => gameFingerprint(batch.games)),
    );

    let generatedGames: GeneratedGame[] = [];
    let seed = generationMode === "diversified" ? input.seed ?? this.createSeed() : undefined;
    let generatorOptions: Record<string, unknown> = {};
    let unique = false;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      generatorOptions = {
        gameCount: input.gameCount,
        generationMode,
        ...(seed !== undefined ? { seed } : {}),
        ...(fixedCount !== undefined ? { fixedCount } : {}),
      };

      if (input.lottery === "mega-sena") {
        generatedGames = generateMegaSenaGames(generationHistory, {
          gameCount: input.gameCount,
          generationMode,
          ...(seed !== undefined ? { seed } : {}),
        });
      } else if (input.lottery === "lotofacil") {
        generatedGames = generateLotofacilGames(generationHistory, {
          gameCount: input.gameCount,
          fixedCount: fixedCount!,
          generationMode,
          ...(seed !== undefined ? { seed } : {}),
        });
      } else {
        generatedGames = generateDiaDeSorteGames(generationHistory, {
          gameCount: input.gameCount,
          generationMode,
          ...(seed !== undefined ? { seed } : {}),
        });
      }

      if (
        !input.persist ||
        generationMode === "deterministic" ||
        input.seed !== undefined ||
        !existingFingerprints.has(gameFingerprint(generatedGames))
      ) {
        unique = true;
        break;
      }

      seed = this.createSeed();
    }

    if (!unique) {
      throw new Error("Unable to generate a distinct diversified batch after multiple attempts");
    }

    if (!input.persist) {
      return {
        lottery: input.lottery,
        ...(targetContestNumber !== undefined ? { targetContestNumber } : {}),
        games: generatedGames,
        generatorOptions,
      };
    }

    const batch = await this.batches.saveBatch({
      lottery: input.lottery,
      ...(targetContestNumber !== undefined ? { targetContestNumber } : {}),
      generatorOptions,
      games: generatedGames,
    });

    return {
      lottery: input.lottery,
      targetContestNumber: batch.targetContestNumber,
      batchId: batch.id,
      games: batch.games,
      generatorOptions: batch.generatorOptions,
    };
  }
}
