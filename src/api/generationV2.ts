import { createHash, randomUUID } from "node:crypto";
import type { Contest, LotteryId } from "../domain/types.js";
import { generateMegaSenaGames, type MegaSenaFixedCount } from "../generator/megaSena.js";
import { generateLotofacilGames } from "../generator/lotofacil.js";
import { generateDiaDeSorteGames, type DiaDeSorteFixedCount } from "../generator/diaDeSorte.js";
import {
  buildGenerationBatchAudit,
  generationHistorySignature,
  scopeGenerationHistory,
  type GenerationConstraints,
  type GenerationPlan,
} from "../generator/planning.js";
import {
  runGenerationPlanInWorker,
  GenerationPlanBusyError,
  GenerationPlanTimeoutError,
} from "../generator/planningWorkerClient.js";
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

interface PlanInput {
  lottery: LotteryId;
  targetContestNumber?: number;
  fixedNumbers?: number[];
  excludedNumbers?: number[];
  constraints?: GenerationConstraints;
}

const planCache = new Map<string, GenerationPlan>();
const planInFlight = new Map<string, Promise<GenerationPlan>>();
const PLAN_CACHE_LIMIT = 120;

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sortedNumbers(values: number[] | undefined): number[] {
  return [...(values ?? [])].sort((a, b) => a - b);
}

function normalizedConstraints(constraints: GenerationConstraints | undefined) {
  return {
    ...(constraints?.odd ? { odd: { min: constraints.odd.min, max: constraints.odd.max } } : {}),
    ...(constraints?.repeated ? { repeated: { min: constraints.repeated.min, max: constraints.repeated.max } } : {}),
    ...(constraints?.sum ? { sum: { min: constraints.sum.min, max: constraints.sum.max } } : {}),
  };
}

export function generationConfigSignature(
  input: Pick<GenerationV2Input, "lottery" | "gameCount" | "fixedCount" | "generationMode" | "fixedNumbers" | "excludedNumbers" | "constraints">,
  targetContestNumber?: number,
): string {
  return hashText(JSON.stringify({
    version: 2,
    lottery: input.lottery,
    gameCount: input.gameCount,
    fixedCount: input.fixedCount,
    targetContestNumber: targetContestNumber ?? null,
    generationMode: input.generationMode ?? "diversified",
    fixedNumbers: sortedNumbers(input.fixedNumbers),
    excludedNumbers: sortedNumbers(input.excludedNumbers),
    constraints: normalizedConstraints(input.constraints),
  }));
}

function gameFingerprint(games: Array<{ numbers: number[]; luckyMonth?: string }>): string {
  return games
    .map((game) => `${[...game.numbers].sort((a, b) => a - b).join("-")}:${game.luckyMonth ?? ""}`)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

function previewId(
  lottery: LotteryId,
  seed: string,
  historySignature: string,
  configSignature: string,
  fingerprint: string,
): string {
  return hashText(`generator-v2|${lottery}|${seed}|${historySignature}|${configSignature}|${fingerprint}`);
}

function validateFixedCount(lottery: LotteryId, fixedCount: number): void {
  const allowed = lottery === "lotofacil" ? [8, 9, 10] : [0, 2, 3];
  if (!Number.isInteger(fixedCount) || !allowed.includes(fixedCount)) {
    throw new ApiError(400, "INVALID_ARGUMENT", `fixedCount must be one of ${allowed.join(", ")} for ${lottery}`);
  }
}

function validateCoreSelection(input: GenerationV2Input): void {
  const manualFixed = input.fixedNumbers ?? [];
  if (manualFixed.length > input.fixedCount) {
    throw new ApiError(400, "INVALID_ARGUMENT", "As dezenas fixadas manualmente excedem o núcleo compartilhado configurado");
  }
  if (input.fixedCount === 0 && manualFixed.length > 0) {
    throw new ApiError(400, "INVALID_ARGUMENT", "Dezenas fixadas manualmente exigem um núcleo compartilhado maior que zero");
  }
}

function planCacheKey(contests: Contest[], input: PlanInput): string {
  const historySignature = generationHistorySignature(contests, input.lottery, input.targetContestNumber);
  return `${historySignature}:${hashText(JSON.stringify({
    lottery: input.lottery,
    targetContestNumber: input.targetContestNumber ?? null,
    fixedNumbers: sortedNumbers(input.fixedNumbers),
    excludedNumbers: sortedNumbers(input.excludedNumbers),
    constraints: normalizedConstraints(input.constraints),
  }))}`;
}

function putPlanCache(key: string, plan: GenerationPlan): void {
  if (planCache.has(key)) planCache.delete(key);
  planCache.set(key, plan);
  while (planCache.size > PLAN_CACHE_LIMIT) {
    const oldest = planCache.keys().next().value as string | undefined;
    if (!oldest) break;
    planCache.delete(oldest);
  }
}

async function planFromSnapshot(contests: Contest[], input: PlanInput): Promise<GenerationPlan> {
  const key = planCacheKey(contests, input);
  const cached = planCache.get(key);
  if (cached) return cached;
  const existing = planInFlight.get(key);
  if (existing) return existing;

  const promise = runGenerationPlanInWorker(contests, input.lottery, {
    ...(input.targetContestNumber !== undefined ? { targetContestNumber: input.targetContestNumber } : {}),
    fixedNumbers: input.fixedNumbers ?? [],
    excludedNumbers: input.excludedNumbers ?? [],
    ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
  });
  planInFlight.set(key, promise);
  try {
    const plan = await promise;
    putPlanCache(key, plan);
    return plan;
  } finally {
    if (planInFlight.get(key) === promise) planInFlight.delete(key);
  }
}

function mapPlanningError(error: unknown): never {
  if (error instanceof GenerationPlanBusyError || (error instanceof Error && error.name === "GenerationPlanBusyError")) {
    throw new ApiError(429, "GENERATION_PLAN_BUSY", "O planejador está processando outra configuração. Tente novamente em instantes.");
  }
  if (error instanceof GenerationPlanTimeoutError || (error instanceof Error && error.name === "GenerationPlanTimeoutError")) {
    throw new ApiError(503, "GENERATION_PLAN_TIMEOUT", "O planejamento combinatório excedeu o tempo seguro de processamento.");
  }
  throw new ApiError(400, "INVALID_GENERATION_PLAN", error instanceof Error ? error.message : "Invalid generation plan");
}

function isExpectedGeneratorFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return [
    "Unable to generate a",
    "Unable to select a Mega-Sena fixed number",
    "Unable to select fixed number",
    "Manual fixed numbers exceed",
    "Manual fixed numbers require",
    "fixed-core repeat limit",
    "Too many numbers",
  ].some((fragment) => error.message.includes(fragment));
}

export async function planGenerationV2(
  services: LotoLabApiServices,
  input: Omit<GenerationV2Input, "gameCount" | "fixedCount" | "generationMode" | "seed" | "persist">,
) {
  const contests = await services.contests.listGenerationHistory(input.lottery);
  try {
    return await planFromSnapshot(contests, {
      lottery: input.lottery,
      ...(input.targetContestNumber !== undefined ? { targetContestNumber: input.targetContestNumber } : {}),
      fixedNumbers: input.fixedNumbers ?? [],
      excludedNumbers: input.excludedNumbers ?? [],
      ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
    });
  } catch (error) {
    return mapPlanningError(error);
  }
}

export async function runGenerationV2(
  services: LotoLabApiServices,
  input: GenerationV2Input,
) {
  validateFixedCount(input.lottery, input.fixedCount);
  validateCoreSelection(input);
  if (!Number.isInteger(input.gameCount) || input.gameCount < 1 || input.gameCount > 10) {
    throw new ApiError(400, "INVALID_ARGUMENT", "gameCount must be an integer between 1 and 10");
  }

  const contests = await services.contests.listGenerationHistory(input.lottery);
  const scoped = scopeGenerationHistory(contests, input.lottery, input.targetContestNumber);
  if (scoped.history.length < MIN_GENERATION_HISTORY) {
    throw new InsufficientGenerationHistoryError(input.lottery, scoped.history.length);
  }

  const currentHistorySignature = generationHistorySignature(contests, input.lottery, input.targetContestNumber);
  const generationMode = input.generationMode ?? "diversified";
  const persist = input.persist ?? false;
  const targetContestNumber = scoped.targetContestNumber;
  const configSignature = generationConfigSignature({
    lottery: input.lottery,
    gameCount: input.gameCount,
    fixedCount: input.fixedCount,
    generationMode,
    fixedNumbers: input.fixedNumbers ?? [],
    excludedNumbers: input.excludedNumbers ?? [],
    constraints: input.constraints,
  }, targetContestNumber);

  if (persist) {
    if (!input.seed) {
      throw new ApiError(400, "PREVIEW_REQUIRED", "Salvar pelo Gerador 2.0 exige a seed de uma prévia ainda válida");
    }
    const preview = await services.games.findGenerationPreview(input.lottery, input.seed);
    if (!preview) {
      throw new ApiError(409, "PREVIEW_EXPIRED", "A prévia não está mais disponível. Gere uma nova prévia antes de salvar.");
    }
    if (preview.configSignature !== configSignature) {
      throw new ApiError(409, "PREVIEW_CONFIG_CHANGED", "A configuração mudou depois da prévia. Gere uma nova prévia antes de salvar.");
    }
    if (preview.historySignature !== currentHistorySignature) {
      throw new ApiError(409, "PREVIEW_STALE", "O histórico foi atualizado desde a prévia. Gere novamente para auditar o lote com os dados atuais.");
    }
    if (preview.targetContestNumber !== targetContestNumber) {
      throw new ApiError(409, "PREVIEW_CONFIG_CHANGED", "O concurso alvo mudou depois da prévia. Gere uma nova prévia antes de salvar.");
    }

    const saved = await services.games.saveBatchIdempotent({
      lottery: preview.lottery,
      ...(preview.targetContestNumber !== undefined ? { targetContestNumber: preview.targetContestNumber } : {}),
      generatorOptions: preview.generatorOptions,
      games: preview.games,
    }, preview.previewId);

    return {
      lottery: preview.lottery,
      ...(preview.targetContestNumber !== undefined ? { targetContestNumber: preview.targetContestNumber } : {}),
      batchId: saved.batch.id,
      games: saved.batch.games,
      generatorOptions: saved.batch.generatorOptions,
      audit: buildGenerationBatchAudit(saved.batch.games, preview.plan),
      preview: {
        id: preview.previewId,
        historySignature: preview.historySignature,
        configSignature: preview.configSignature,
        gameFingerprint: preview.gameFingerprint,
        expiresAt: preview.expiresAt,
      },
      alreadySaved: !saved.created,
    };
  }

  let plan: GenerationPlan;
  try {
    plan = await planFromSnapshot(contests, {
      lottery: input.lottery,
      ...(input.targetContestNumber !== undefined ? { targetContestNumber: input.targetContestNumber } : {}),
      fixedNumbers: input.fixedNumbers ?? [],
      excludedNumbers: input.excludedNumbers ?? [],
      ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
    });
  } catch (error) {
    return mapPlanningError(error);
  }

  if (input.constraints?.repeated && !plan.dataQuality.previousContestAvailable) {
    throw new ApiError(422, "REPEAT_REFERENCE_UNAVAILABLE", "O concurso imediatamente anterior ao alvo não está disponível; o filtro de repetição não pode ser aplicado com segurança.");
  }
  if (plan.space.eligibleCombinations < 1) {
    throw new ApiError(422, "NO_VALID_COMBINATIONS", "Nenhuma combinação atende à configuração atual. Afrouxe os filtros ou reveja as dezenas fixadas/excluídas.");
  }
  const algorithmSpace = plan.algorithmSpaces[String(input.fixedCount)];
  if (!algorithmSpace || algorithmSpace.rawCombinationCapacity < 1) {
    throw new ApiError(422, "ALGORITHM_SPACE_EMPTY", "A configuração não deixa combinações suficientes no espaço que o algoritmo consegue explorar.");
  }

  const seed = input.seed ?? randomUUID();
  const referenceContestNumber = plan.dataQuality.previousContestAvailable
    ? plan.referenceContestNumber ?? null
    : null;
  let games: ReturnType<typeof generateMegaSenaGames>;
  try {
    if (input.lottery === "mega-sena") {
      games = generateMegaSenaGames(scoped.history, {
        gameCount: input.gameCount,
        fixedCount: input.fixedCount as MegaSenaFixedCount,
        generationMode,
        ...(generationMode === "diversified" ? { seed } : {}),
        fixedNumbers: input.fixedNumbers ?? [],
        excludedNumbers: input.excludedNumbers ?? [],
        ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
        referenceContestNumber,
      });
    } else if (input.lottery === "lotofacil") {
      games = generateLotofacilGames(scoped.history, {
        gameCount: input.gameCount,
        fixedCount: input.fixedCount as 8 | 9 | 10,
        generationMode,
        ...(generationMode === "diversified" ? { seed } : {}),
        fixedNumbers: input.fixedNumbers ?? [],
        excludedNumbers: input.excludedNumbers ?? [],
        ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
        referenceContestNumber,
      });
    } else {
      games = generateDiaDeSorteGames(scoped.history, {
        gameCount: input.gameCount,
        fixedCount: input.fixedCount as DiaDeSorteFixedCount,
        generationMode,
        ...(generationMode === "diversified" ? { seed } : {}),
        fixedNumbers: input.fixedNumbers ?? [],
        excludedNumbers: input.excludedNumbers ?? [],
        ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
        referenceContestNumber,
      });
    }
  } catch (error) {
    if (isExpectedGeneratorFailure(error)) {
      throw new ApiError(
        422,
        "ALGORITHM_SPACE_UNSATISFIED",
        "Há combinações matematicamente elegíveis, mas o pool ranqueado atual do algoritmo não atende à configuração. Revise o núcleo, as exclusões ou os filtros.",
      );
    }
    throw error;
  }

  const fingerprint = gameFingerprint(games);
  const id = previewId(input.lottery, seed, currentHistorySignature, configSignature, fingerprint);
  const generatorOptions: Record<string, unknown> = {
    version: 2,
    gameCount: input.gameCount,
    fixedCount: input.fixedCount,
    generationMode,
    seed,
    fixedNumbers: sortedNumbers(input.fixedNumbers),
    excludedNumbers: sortedNumbers(input.excludedNumbers),
    constraints: normalizedConstraints(input.constraints),
    historySignature: currentHistorySignature,
    configSignature,
    gameFingerprint: fingerprint,
    previewId: id,
  };
  const audit = buildGenerationBatchAudit(games, plan);

  await services.games.deleteExpiredGenerationPreviews();
  const storedPreview = await services.games.saveGenerationPreview({
    previewId: id,
    lottery: input.lottery,
    seed,
    ...(targetContestNumber !== undefined ? { targetContestNumber } : {}),
    historySignature: currentHistorySignature,
    configSignature,
    gameFingerprint: fingerprint,
    generatorOptions,
    games,
    plan,
  });

  return {
    lottery: input.lottery,
    ...(targetContestNumber !== undefined ? { targetContestNumber } : {}),
    games,
    generatorOptions,
    audit,
    preview: {
      id,
      historySignature: currentHistorySignature,
      configSignature,
      gameFingerprint: fingerprint,
      expiresAt: storedPreview.expiresAt,
    },
  };
}
