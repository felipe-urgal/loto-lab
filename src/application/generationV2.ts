import { createHash, randomUUID } from "node:crypto";
import type { Contest, GeneratedGame, LotteryId } from "../domain/types.js";
import { quoteOfficialBet } from "../domain/betRules.js";
import { getLotteryConfig } from "../lotteries/config.js";
import {
  quoteMaisMilionaria,
  quoteSuperSete,
  quoteTimemania,
} from "../domain/structuredBetRules.js";
import { generateDiaDeSorteGames, type DiaDeSorteFixedCount } from "../generator/diaDeSorte.js";
import { generateCoveringDesign } from "../generator/coveringDesign.js";
import { generateLotofacilGames } from "../generator/lotofacil.js";
import { generateMegaSenaGames, type MegaSenaFixedCount } from "../generator/megaSena.js";
import {
  generatePortfolioGames,
  generateUniformGames,
  type GenerationPurpose,
} from "../generator/generationPurpose.js";
import {
  buildGenerationBatchAudit,
  generationHistorySignature,
  scopeGenerationHistory,
  type GenerationConstraints,
  type GenerationPlan,
} from "../generator/planning.js";
import type { GenerationMode } from "../generator/shared.js";
import {
  InsufficientGenerationHistoryError,
  MIN_GENERATION_HISTORY,
} from "./generateGames.js";
import type { ApplicationGameBatch, SaveApplicationGameBatchInput } from "./gameBatch.js";

export interface GenerationV2Input {
  lottery: LotteryId;
  gameCount: number;
  fixedCount: number;
  betSize?: number;
  targetContestNumber?: number;
  purpose?: GenerationPurpose;
  generationMode?: GenerationMode;
  seed?: string;
  fixedNumbers?: number[];
  excludedNumbers?: number[];
  constraints?: GenerationConstraints;
  cloverCount?: number;
  favoriteTeam?: string;
  columnMarks?: number[];
  coveragePoolNumbers?: number[];
  coverageTargetSize?: number;
  coverageBudgetCents?: number;
  persist?: boolean;
}

export interface GenerationV2PlanInput {
  lottery: LotteryId;
  betSize?: number;
  targetContestNumber?: number;
  fixedNumbers?: number[];
  excludedNumbers?: number[];
  constraints?: GenerationConstraints;
}

export interface GenerationV2Preview {
  previewId: string;
  lottery: LotteryId;
  seed: string;
  targetContestNumber?: number;
  historySignature: string;
  configSignature: string;
  gameFingerprint: string;
  generatorOptions: Record<string, unknown>;
  games: GeneratedGame[];
  plan: GenerationPlan;
  createdAt: string;
  expiresAt: string;
}

export type SaveGenerationV2PreviewInput = Omit<GenerationV2Preview, "createdAt" | "expiresAt">;

export interface GenerationV2HistoryReader {
  listGenerationHistory(lottery: LotteryId): Promise<Contest[]>;
}

export interface GenerationV2Store {
  findGenerationPreview(lottery: LotteryId, seed: string): Promise<GenerationV2Preview | undefined>;
  deleteExpiredGenerationPreviews(): Promise<number>;
  saveGenerationPreview(input: SaveGenerationV2PreviewInput): Promise<GenerationV2Preview>;
  saveBatchIdempotent(
    input: SaveApplicationGameBatchInput,
    generationKey: string,
  ): Promise<{ batch: ApplicationGameBatch; created: boolean }>;
}

export type GenerationV2PlanExecutor = (
  contests: Contest[],
  lottery: LotteryId,
  options: {
    targetContestNumber?: number;
    betSize?: number;
    fixedNumbers?: number[];
    excludedNumbers?: number[];
    constraints?: GenerationConstraints;
  },
) => Promise<GenerationPlan>;

export type GenerationV2ErrorCode =
  | "INVALID_ARGUMENT"
  | "GENERATION_PLAN_BUSY"
  | "GENERATION_PLAN_TIMEOUT"
  | "INVALID_GENERATION_PLAN"
  | "PREVIEW_REQUIRED"
  | "PREVIEW_EXPIRED"
  | "PREVIEW_CONFIG_CHANGED"
  | "PREVIEW_STALE"
  | "REPEAT_REFERENCE_UNAVAILABLE"
  | "NO_VALID_COMBINATIONS"
  | "ALGORITHM_SPACE_EMPTY"
  | "ALGORITHM_SPACE_UNSATISFIED";

export class GenerationV2Error extends Error {
  constructor(
    readonly code: GenerationV2ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GenerationV2Error";
  }
}

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
  input: Pick<GenerationV2Input, "lottery" | "gameCount" | "fixedCount" | "betSize" | "purpose" | "generationMode" | "fixedNumbers" | "excludedNumbers" | "constraints" | "cloverCount" | "favoriteTeam" | "columnMarks" | "coveragePoolNumbers" | "coverageTargetSize" | "coverageBudgetCents">,
  targetContestNumber?: number,
): string {
  return hashText(JSON.stringify({
    version: 2,
    lottery: input.lottery,
    gameCount: input.gameCount,
    fixedCount: input.fixedCount,
    betSize: input.betSize ?? null,
    targetContestNumber: targetContestNumber ?? null,
    purpose: input.purpose ?? "uniform",
    generationMode: input.generationMode ?? "diversified",
    fixedNumbers: sortedNumbers(input.fixedNumbers),
    excludedNumbers: sortedNumbers(input.excludedNumbers),
    constraints: normalizedConstraints(input.constraints),
    cloverCount: input.cloverCount ?? null,
    favoriteTeam: input.favoriteTeam?.trim() ?? null,
    columnMarks: input.columnMarks ?? null,
    coveragePoolNumbers: sortedNumbers(input.coveragePoolNumbers),
    coverageTargetSize: input.coverageTargetSize ?? null,
    coverageBudgetCents: input.coverageBudgetCents ?? null,
  }));
}

function gameFingerprint(games: GeneratedGame[]): string {
  return games
    .map((game) => [
      [...game.numbers].sort((a, b) => a - b).join("-"),
      game.luckyMonth ?? "",
      game.secondary ? JSON.stringify(game.secondary) : "",
      game.columns?.map((column) => column.join(".")).join("-") ?? "",
    ].join(":"))
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
  const allowed = lottery === "lotofacil"
    ? [8, 9, 10]
    : lottery === "mega-sena" || lottery === "dia-de-sorte"
      ? [0, 2, 3]
      : [0];
  if (!Number.isInteger(fixedCount) || !allowed.includes(fixedCount)) {
    throw new GenerationV2Error("INVALID_ARGUMENT", `fixedCount must be one of ${allowed.join(", ")} for ${lottery}`);
  }
}

function validateCoreSelection(input: GenerationV2Input): void {
  const manualFixed = input.fixedNumbers ?? [];
  if (manualFixed.length > input.fixedCount) {
    throw new GenerationV2Error("INVALID_ARGUMENT", "As dezenas fixadas manualmente excedem o núcleo compartilhado configurado");
  }
  if (input.fixedCount === 0 && manualFixed.length > 0) {
    throw new GenerationV2Error("INVALID_ARGUMENT", "Dezenas fixadas manualmente exigem um núcleo compartilhado maior que zero");
  }
}

function planCacheKey(contests: Contest[], input: GenerationV2PlanInput): string {
  const historySignature = generationHistorySignature(contests, input.lottery, input.targetContestNumber);
  return `${historySignature}:${hashText(JSON.stringify({
    lottery: input.lottery,
    betSize: input.betSize ?? null,
    targetContestNumber: input.targetContestNumber ?? null,
    fixedNumbers: sortedNumbers(input.fixedNumbers),
    excludedNumbers: sortedNumbers(input.excludedNumbers),
    constraints: normalizedConstraints(input.constraints),
  }))}`;
}

function mapPlanningError(error: unknown): never {
  if (error instanceof GenerationV2Error) throw error;
  if (error instanceof Error && error.name === "GenerationPlanBusyError") {
    throw new GenerationV2Error(
      "GENERATION_PLAN_BUSY",
      "O planejador está processando outra configuração. Tente novamente em instantes.",
    );
  }
  if (error instanceof Error && error.name === "GenerationPlanTimeoutError") {
    throw new GenerationV2Error(
      "GENERATION_PLAN_TIMEOUT",
      "O planejamento combinatório excedeu o tempo seguro de processamento.",
    );
  }
  throw new GenerationV2Error(
    "INVALID_GENERATION_PLAN",
    error instanceof Error ? error.message : "Invalid generation plan",
  );
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
    "Unable to sample",
    "Unable to build a diversified portfolio",
    "Unable to select the requested portfolio size",
    "Timemania generation requires an explicit Time do Coração",
    "Coverage constraints leave no valid candidate tickets",
    "Coverage candidate space exceeds safe limit",
    "Coverage target space exceeds safe limit",
  ].some((fragment) => error.message.includes(fragment));
}

export class GenerationV2UseCase {
  private readonly planCache = new Map<string, GenerationPlan>();
  private readonly planInFlight = new Map<string, Promise<GenerationPlan>>();
  private readonly planCacheLimit = 120;

  constructor(
    private readonly history: GenerationV2HistoryReader,
    private readonly store: GenerationV2Store,
    private readonly executePlan: GenerationV2PlanExecutor,
    private readonly createSeed: () => string = randomUUID,
  ) {}

  private putPlanCache(key: string, plan: GenerationPlan): void {
    if (this.planCache.has(key)) this.planCache.delete(key);
    this.planCache.set(key, plan);
    while (this.planCache.size > this.planCacheLimit) {
      const oldest = this.planCache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.planCache.delete(oldest);
    }
  }

  private async planFromSnapshot(contests: Contest[], input: GenerationV2PlanInput): Promise<GenerationPlan> {
    const key = planCacheKey(contests, input);
    const cached = this.planCache.get(key);
    if (cached) return cached;
    const existing = this.planInFlight.get(key);
    if (existing) return existing;

    const promise = this.executePlan(contests, input.lottery, {
      ...(input.targetContestNumber !== undefined ? { targetContestNumber: input.targetContestNumber } : {}),
      ...(input.betSize !== undefined ? { betSize: input.betSize } : {}),
      fixedNumbers: input.fixedNumbers ?? [],
      excludedNumbers: input.excludedNumbers ?? [],
      ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
    });
    this.planInFlight.set(key, promise);
    try {
      const plan = await promise;
      this.putPlanCache(key, plan);
      return plan;
    } finally {
      if (this.planInFlight.get(key) === promise) this.planInFlight.delete(key);
    }
  }

  async plan(input: GenerationV2PlanInput): Promise<GenerationPlan> {
    const contests = await this.history.listGenerationHistory(input.lottery);
    try {
      return await this.planFromSnapshot(contests, input);
    } catch (error) {
      return mapPlanningError(error);
    }
  }

  async execute(input: GenerationV2Input) {
    const purpose = input.purpose ?? "uniform";
    if (purpose !== "coverage") {
      validateFixedCount(input.lottery, input.fixedCount);
      validateCoreSelection(input);
    }
    const maximumGameCount = purpose === "coverage" ? 100 : 10;
    if (!Number.isInteger(input.gameCount) || input.gameCount < 1 || input.gameCount > maximumGameCount) {
      throw new GenerationV2Error("INVALID_ARGUMENT", `gameCount must be an integer between 1 and ${maximumGameCount}`);
    }

    const contests = await this.history.listGenerationHistory(input.lottery);
    const scoped = scopeGenerationHistory(contests, input.lottery, input.targetContestNumber);
    const config = getLotteryConfig(input.lottery);
    const effectiveBetSize = input.betSize ?? config.defaultBetSize;
    const betQuote = input.lottery === "mais-milionaria"
      ? quoteMaisMilionaria(effectiveBetSize, input.cloverCount ?? 2, input.gameCount)
      : input.lottery === "timemania"
        ? quoteTimemania(input.gameCount)
        : input.lottery === "super-sete"
          ? quoteSuperSete(input.columnMarks ?? Array(7).fill(1), input.gameCount)
          : quoteOfficialBet(input.lottery, effectiveBetSize, input.gameCount);
    if (!betQuote && effectiveBetSize !== config.defaultBetSize) {
      throw new GenerationV2Error(
        "INVALID_ARGUMENT",
        `Official bet cardinality is not available for ${input.lottery}`,
      );
    }
    if (purpose === "coverage" && !["mega-sena", "lotofacil", "quina", "dupla-sena"].includes(input.lottery)) {
      throw new GenerationV2Error(
        "INVALID_ARGUMENT",
        `Coverage generation is not available for ${input.lottery}`,
      );
    }
    if (purpose === "coverage" && !betQuote) {
      throw new GenerationV2Error("INVALID_ARGUMENT", "Coverage generation requires an official bet price");
    }
    if (purpose === "coverage") {
      const pool = sortedNumbers(input.coveragePoolNumbers);
      if (pool.length < effectiveBetSize) {
        throw new GenerationV2Error("INVALID_ARGUMENT", "Coverage pool must contain at least the bet size");
      }
      if (new Set(pool).size !== pool.length) {
        throw new GenerationV2Error("INVALID_ARGUMENT", "Coverage pool numbers must be unique");
      }
      const targetSize = input.coverageTargetSize ?? Math.max(1, config.drawSize - 1);
      if (!Number.isInteger(targetSize) || targetSize < 1 || targetSize > effectiveBetSize) {
        throw new GenerationV2Error("INVALID_ARGUMENT", "coverageTargetSize must fit between 1 and betSize");
      }
      if (input.coverageBudgetCents !== undefined && (!Number.isInteger(input.coverageBudgetCents) || input.coverageBudgetCents < 0)) {
        throw new GenerationV2Error("INVALID_ARGUMENT", "coverageBudgetCents must be a non-negative integer");
      }
    }
    if (purpose === "experimental" && effectiveBetSize !== config.defaultBetSize) {
      throw new GenerationV2Error(
        "INVALID_ARGUMENT",
        "Multiple-number bets are available only for uniform or portfolio generation",
      );
    }
    if (
      purpose === "experimental"
      && input.lottery !== "mega-sena"
      && input.lottery !== "lotofacil"
      && input.lottery !== "dia-de-sorte"
    ) {
      throw new GenerationV2Error(
        "INVALID_ARGUMENT",
        `Experimental generation is not available for ${input.lottery}`,
      );
    }
    if (purpose === "experimental" && scoped.history.length < MIN_GENERATION_HISTORY) {
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
      betSize: effectiveBetSize,
      purpose,
      generationMode,
      fixedNumbers: input.fixedNumbers ?? [],
      excludedNumbers: input.excludedNumbers ?? [],
      constraints: input.constraints,
      cloverCount: input.cloverCount,
      favoriteTeam: input.favoriteTeam,
      columnMarks: input.columnMarks,
      coveragePoolNumbers: input.coveragePoolNumbers,
      coverageTargetSize: input.coverageTargetSize,
      coverageBudgetCents: input.coverageBudgetCents,
    }, targetContestNumber);

    if (persist) {
      if (!input.seed) {
        throw new GenerationV2Error(
          "PREVIEW_REQUIRED",
          "Salvar pelo Gerador 2.0 exige a seed de uma prévia ainda válida",
        );
      }
      const preview = await this.store.findGenerationPreview(input.lottery, input.seed);
      if (!preview) {
        throw new GenerationV2Error(
          "PREVIEW_EXPIRED",
          "A prévia não está mais disponível. Gere uma nova prévia antes de salvar.",
        );
      }
      if (preview.configSignature !== configSignature) {
        throw new GenerationV2Error(
          "PREVIEW_CONFIG_CHANGED",
          "A configuração mudou depois da prévia. Gere uma nova prévia antes de salvar.",
        );
      }
      if (preview.historySignature !== currentHistorySignature) {
        throw new GenerationV2Error(
          "PREVIEW_STALE",
          "O histórico foi atualizado desde a prévia. Gere novamente para auditar o lote com os dados atuais.",
        );
      }
      if (preview.targetContestNumber !== targetContestNumber) {
        throw new GenerationV2Error(
          "PREVIEW_CONFIG_CHANGED",
          "O concurso alvo mudou depois da prévia. Gere uma nova prévia antes de salvar.",
        );
      }

      const saved = await this.store.saveBatchIdempotent({
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
      plan = await this.planFromSnapshot(contests, {
        lottery: input.lottery,
        betSize: effectiveBetSize,
        ...(input.targetContestNumber !== undefined ? { targetContestNumber: input.targetContestNumber } : {}),
        fixedNumbers: input.fixedNumbers ?? [],
        excludedNumbers: input.excludedNumbers ?? [],
        ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
      });
    } catch (error) {
      return mapPlanningError(error);
    }

    if (input.constraints?.repeated && !plan.dataQuality.previousContestAvailable) {
      throw new GenerationV2Error(
        "REPEAT_REFERENCE_UNAVAILABLE",
        "O concurso imediatamente anterior ao alvo não está disponível; o filtro de repetição não pode ser aplicado com segurança.",
      );
    }
    if (plan.space.eligibleCombinations < 1) {
      throw new GenerationV2Error(
        "NO_VALID_COMBINATIONS",
        "Nenhuma combinação atende à configuração atual. Afrouxe os filtros ou reveja as dezenas fixadas/excluídas.",
      );
    }
    const algorithmSpace = plan.algorithmSpaces[String(input.fixedCount)];
    if (
      purpose === "experimental"
      && (!algorithmSpace || algorithmSpace.rawCombinationCapacity < 1)
    ) {
      throw new GenerationV2Error(
        "ALGORITHM_SPACE_EMPTY",
        "A configuração não deixa combinações suficientes no espaço experimental atual.",
      );
    }

    const seed = input.seed ?? this.createSeed();
    const referenceContestNumber = plan.dataQuality.previousContestAvailable
      ? plan.referenceContestNumber ?? null
      : null;
    let games: GeneratedGame[];
    try {
      if (purpose === "coverage") {
        const result = generateCoveringDesign({
          lottery: input.lottery,
          poolNumbers: input.coveragePoolNumbers ?? [],
          ticketSize: effectiveBetSize,
          targetSize: input.coverageTargetSize ?? Math.max(1, config.drawSize - 1),
          maxTickets: input.gameCount,
          pricePerTicketCents: betQuote?.pricePerBetCents ?? 0,
          ...(input.coverageBudgetCents !== undefined ? { budgetCents: input.coverageBudgetCents } : {}),
          ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
          ...(referenceContestNumber !== null
            ? (() => {
                const referenceContest = scoped.history.find((contest) => contest.number === referenceContestNumber);
                return referenceContest ? { referenceContest } : {};
              })()
            : {}),
        });
        games = result.games;
        if (games.length < 1) {
          throw new GenerationV2Error("ALGORITHM_SPACE_UNSATISFIED", "O orçamento ou os filtros não permitem selecionar nenhum jogo de cobertura.");
        }
      } else if (purpose === "uniform" || purpose === "portfolio") {
        const generate = purpose === "uniform" ? generateUniformGames : generatePortfolioGames;
        games = generate({
          lottery: input.lottery,
          gameCount: input.gameCount,
          fixedCount: input.fixedCount,
          betSize: effectiveBetSize,
          seed,
          fixedNumbers: input.fixedNumbers ?? [],
          excludedNumbers: input.excludedNumbers ?? [],
          ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
          ...(input.cloverCount !== undefined ? { cloverCount: input.cloverCount } : {}),
          ...(input.favoriteTeam !== undefined ? { favoriteTeam: input.favoriteTeam } : {}),
          ...(input.columnMarks !== undefined ? { columnMarks: input.columnMarks } : {}),
          ...(referenceContestNumber !== null
            ? (() => {
                const referenceContest = scoped.history.find(
                  (contest) => contest.number === referenceContestNumber,
                );
                return referenceContest ? { referenceContest } : {};
              })()
            : {}),
        });
      } else if (input.lottery === "mega-sena") {
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
      } else if (input.lottery === "dia-de-sorte") {
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
      } else {
        throw new GenerationV2Error(
          "INVALID_ARGUMENT",
          `Experimental generation is not available for ${input.lottery}`,
        );
      }
    } catch (error) {
      if (isExpectedGeneratorFailure(error)) {
        throw new GenerationV2Error(
          "ALGORITHM_SPACE_UNSATISFIED",
          purpose === "experimental"
            ? "Há combinações matematicamente elegíveis, mas a estratégia experimental atual não atende à configuração. Revise o núcleo, as exclusões ou os filtros."
            : "Não foi possível amostrar jogos suficientes no espaço válido. Revise o núcleo, as exclusões ou os filtros.",
        );
      }
      throw error;
    }

    const coverageResult = purpose === "coverage"
      ? generateCoveringDesign({
          lottery: input.lottery,
          poolNumbers: input.coveragePoolNumbers ?? [],
          ticketSize: effectiveBetSize,
          targetSize: input.coverageTargetSize ?? Math.max(1, config.drawSize - 1),
          maxTickets: input.gameCount,
          pricePerTicketCents: betQuote?.pricePerBetCents ?? 0,
          ...(input.coverageBudgetCents !== undefined ? { budgetCents: input.coverageBudgetCents } : {}),
          ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
          ...(referenceContestNumber !== null
            ? (() => {
                const referenceContest = scoped.history.find((contest) => contest.number === referenceContestNumber);
                return referenceContest ? { referenceContest } : {};
              })()
            : {}),
        })
      : undefined;
    const effectiveBetQuote = betQuote && purpose === "coverage"
      ? quoteOfficialBet(input.lottery, effectiveBetSize, games.length)
      : betQuote;
    const fingerprint = gameFingerprint(games);
    const id = previewId(input.lottery, seed, currentHistorySignature, configSignature, fingerprint);
    const generatorOptions: Record<string, unknown> = {
      version: 2,
      gameCount: input.gameCount,
      fixedCount: input.fixedCount,
      betSize: effectiveBetSize,
      ...(effectiveBetQuote ? { betQuote: effectiveBetQuote } : {}),
      purpose,
      generationMode,
      ...(purpose === "experimental"
        ? {
            experimentalStrategy: {
              id: "legacy-historical-ranking",
              version: 2,
              evidenceSource: "backtests",
            },
          }
        : {}),
      seed,
      fixedNumbers: sortedNumbers(input.fixedNumbers),
      excludedNumbers: sortedNumbers(input.excludedNumbers),
      constraints: normalizedConstraints(input.constraints),
      ...(input.cloverCount !== undefined ? { cloverCount: input.cloverCount } : {}),
      ...(input.favoriteTeam !== undefined ? { favoriteTeam: input.favoriteTeam.trim() } : {}),
      ...(input.columnMarks !== undefined ? { columnMarks: input.columnMarks } : {}),
      ...(coverageResult ? { coverage: coverageResult.report } : {}),
      ...(input.coveragePoolNumbers !== undefined ? { coveragePoolNumbers: sortedNumbers(input.coveragePoolNumbers) } : {}),
      ...(input.coverageTargetSize !== undefined ? { coverageTargetSize: input.coverageTargetSize } : {}),
      ...(input.coverageBudgetCents !== undefined ? { coverageBudgetCents: input.coverageBudgetCents } : {}),
      historySignature: currentHistorySignature,
      configSignature,
      gameFingerprint: fingerprint,
      previewId: id,
    };
    const audit = buildGenerationBatchAudit(games, plan);

    await this.store.deleteExpiredGenerationPreviews();
    const storedPreview = await this.store.saveGenerationPreview({
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
}
