import { randomUUID } from "node:crypto";
import type { LotteryId } from "../domain/types.js";
import { generateMegaSenaGames, type MegaSenaFixedCount } from "../generator/megaSena.js";
import { generateLotofacilGames } from "../generator/lotofacil.js";
import { generateDiaDeSorteGames, type DiaDeSorteFixedCount } from "../generator/diaDeSorte.js";
import {
  buildGenerationBatchAudit,
  buildGenerationPlan,
  type GenerationConstraints,
} from "../generator/planning.js";
import type { GenerationMode } from "../generator/shared.js";
import { ApiError } from "./http.js";
import {
  InsufficientGenerationHistoryError,
  MIN_GENERATION_HISTORY,
  type LotoLabApiServices,
} from "./services.js";

export interface GenerationV2Input {
  lottery: LotteryId;
  gameCount: number;
  fixedCount: number;
  targetContestNumber?: number;
  generationMode?: GenerationMode;
  seed?: string;
  fixedNumbers?: number[];
  excludedNumbers?: number[];
  constraints?: GenerationConstraints;
  persist?: boolean;
}

function gameFingerprint(games: Array<{ numbers: number[]; luckyMonth?: string }>): string {
  return games
    .map((game) => `${game.numbers.join("-")}:${game.luckyMonth ?? ""}`)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

function validateFixedCount(lottery: LotteryId, fixedCount: number): void {
  const allowed = lottery === "lotofacil" ? [8, 9, 10] : [0, 2, 3];
  if (!Number.isInteger(fixedCount) || !allowed.includes(fixedCount)) {
    throw new ApiError(400, "INVALID_ARGUMENT", `fixedCount must be one of ${allowed.join(", ")} for ${lottery}`);
  }
}

export async function planGenerationV2(
  services: LotoLabApiServices,
  input: Omit<GenerationV2Input, "gameCount" | "fixedCount" | "generationMode" | "seed" | "persist">,
) {
  const contests = await services.contests.list({ lottery: input.lottery, order: "asc" });
  try {
    return buildGenerationPlan(contests, input.lottery, {
      ...(input.targetContestNumber !== undefined ? { targetContestNumber: input.targetContestNumber } : {}),
      fixedNumbers: input.fixedNumbers ?? [],
      excludedNumbers: input.excludedNumbers ?? [],
      ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
    });
  } catch (error) {
    throw new ApiError(400, "INVALID_GENERATION_PLAN", error instanceof Error ? error.message : "Invalid generation plan");
  }
}

export async function runGenerationV2(
  services: LotoLabApiServices,
  input: GenerationV2Input,
) {
  validateFixedCount(input.lottery, input.fixedCount);
  if (!Number.isInteger(input.gameCount) || input.gameCount < 1 || input.gameCount > 10) {
    throw new ApiError(400, "INVALID_ARGUMENT", "gameCount must be an integer between 1 and 10");
  }

  const contests = await services.contests.list({ lottery: input.lottery, order: "asc" });
  const history = input.targetContestNumber === undefined
    ? contests
    : contests.filter((contest) => contest.number < input.targetContestNumber!);
  if (history.length < MIN_GENERATION_HISTORY) {
    throw new InsufficientGenerationHistoryError(input.lottery, history.length);
  }

  const plan = await planGenerationV2(services, {
    lottery: input.lottery,
    ...(input.targetContestNumber !== undefined ? { targetContestNumber: input.targetContestNumber } : {}),
    fixedNumbers: input.fixedNumbers ?? [],
    excludedNumbers: input.excludedNumbers ?? [],
    ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
  });
  if (plan.space.eligibleCombinations < 1) {
    throw new ApiError(422, "NO_VALID_COMBINATIONS", "Nenhuma combinação atende à configuração atual. Afrouxe os filtros ou reveja as dezenas fixadas/excluídas.");
  }

  const generationMode = input.generationMode ?? "diversified";
  const persist = input.persist ?? false;
  const targetContestNumber = plan.targetContestNumber;
  const recentBatches = persist ? await services.games.listRecent(input.lottery, 100) : [];
  const existingFingerprints = new Set(
    recentBatches
      .filter((batch) => batch.targetContestNumber === targetContestNumber)
      .map((batch) => gameFingerprint(batch.games)),
  );

  let seed = generationMode === "diversified" ? input.seed ?? randomUUID() : undefined;
  let games: ReturnType<typeof generateMegaSenaGames> = [];
  let generatorOptions: Record<string, unknown> = {};
  let distinct = false;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    generatorOptions = {
      version: 2,
      gameCount: input.gameCount,
      fixedCount: input.fixedCount,
      generationMode,
      ...(seed !== undefined ? { seed } : {}),
      fixedNumbers: input.fixedNumbers ?? [],
      excludedNumbers: input.excludedNumbers ?? [],
      constraints: input.constraints ?? {},
    };

    try {
      if (input.lottery === "mega-sena") {
        games = generateMegaSenaGames(history, {
          gameCount: input.gameCount,
          fixedCount: input.fixedCount as MegaSenaFixedCount,
          generationMode,
          ...(seed !== undefined ? { seed } : {}),
          fixedNumbers: input.fixedNumbers ?? [],
          excludedNumbers: input.excludedNumbers ?? [],
          ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
        });
      } else if (input.lottery === "lotofacil") {
        games = generateLotofacilGames(history, {
          gameCount: input.gameCount,
          fixedCount: input.fixedCount as 8 | 9 | 10,
          generationMode,
          ...(seed !== undefined ? { seed } : {}),
          fixedNumbers: input.fixedNumbers ?? [],
          excludedNumbers: input.excludedNumbers ?? [],
          ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
        });
      } else {
        games = generateDiaDeSorteGames(history, {
          gameCount: input.gameCount,
          fixedCount: input.fixedCount as DiaDeSorteFixedCount,
          generationMode,
          ...(seed !== undefined ? { seed } : {}),
          fixedNumbers: input.fixedNumbers ?? [],
          excludedNumbers: input.excludedNumbers ?? [],
          ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
        });
      }
    } catch (error) {
      throw new ApiError(422, "GENERATION_CONSTRAINTS_UNSATISFIED", error instanceof Error ? error.message : "Unable to generate games with the requested configuration");
    }

    const fingerprint = gameFingerprint(games);
    if (!persist || input.seed !== undefined || !existingFingerprints.has(fingerprint)) {
      distinct = true;
      break;
    }
    seed = randomUUID();
  }

  if (!distinct) {
    throw new ApiError(409, "DUPLICATE_GENERATION", "Não foi possível criar um lote novo após várias tentativas. Altere a configuração e tente novamente.");
  }

  const audit = buildGenerationBatchAudit(games, plan);
  if (!persist) {
    return {
      lottery: input.lottery,
      ...(targetContestNumber !== undefined ? { targetContestNumber } : {}),
      games,
      generatorOptions,
      audit,
    };
  }

  if (input.seed !== undefined) {
    const fingerprint = gameFingerprint(games);
    const existing = recentBatches.find((batch) =>
      batch.targetContestNumber === targetContestNumber &&
      batch.generatorOptions?.seed === input.seed &&
      gameFingerprint(batch.games) === fingerprint
    );
    if (existing) {
      return {
        lottery: input.lottery,
        targetContestNumber: existing.targetContestNumber,
        batchId: existing.id,
        games: existing.games,
        generatorOptions: existing.generatorOptions,
        audit: buildGenerationBatchAudit(existing.games, plan),
        alreadySaved: true,
      };
    }
  }

  const batch = await services.games.saveBatch({
    lottery: input.lottery,
    ...(targetContestNumber !== undefined ? { targetContestNumber } : {}),
    generatorOptions,
    games,
  });
  return {
    lottery: input.lottery,
    targetContestNumber: batch.targetContestNumber,
    batchId: batch.id,
    games: batch.games,
    generatorOptions: batch.generatorOptions,
    audit: buildGenerationBatchAudit(batch.games, plan),
    alreadySaved: false,
  };
}
