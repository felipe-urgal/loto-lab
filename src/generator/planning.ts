import { createHash } from "node:crypto";
import type { Contest, GeneratedGame, LotteryId, NumberTier } from "../domain/types.js";
import { buildNumberAnalysis } from "../analysis/scoring.js";
import { getLotteryConfig } from "../lotteries/config.js";
import {
  validateGenerationConstraints,
  validateGenerationSelection,
} from "./planningConstraints.js";
import {
  buildConditionalBaseline,
  buildGenerationAlgorithmSpaces,
  combinationCount,
  countEligibleGenerationCombinations,
  withinGenerationRange,
  type GenerationAlgorithmSpace,
  type GenerationBaseline,
  type GenerationConstraints,
  type GenerationRange,
} from "./planningSpace.js";

export { combinationCount } from "./planningSpace.js";
export type {
  GenerationAlgorithmSpace,
  GenerationBaseline,
  GenerationConstraints,
  GenerationRange,
} from "./planningSpace.js";

export interface GenerationMethodologyProfile {
  defaultFixedCount: number;
  fixedCountOptions: number[];
  preferredOdd: GenerationRange;
  preferredRepeated: GenerationRange;
  acceptableRepeated: GenerationRange;
  notes: string[];
}

export interface GenerationPlan {
  lottery: LotteryId;
  historyCount: number;
  historySignature: string;
  referenceContestNumber?: number;
  targetContestNumber?: number;
  universeSize: number;
  drawSize: number;
  fixedNumbers: number[];
  excludedNumbers: number[];
  constraints: GenerationConstraints;
  methodology: GenerationMethodologyProfile;
  numberTiers: Record<NumberTier, number[]>;
  lotteryBaseline: GenerationBaseline;
  baseline: GenerationBaseline;
  dataQuality: {
    previousContestAvailable: boolean;
    expectedPreviousContestNumber?: number;
    missingPreviousContestNumber?: number;
    historyGapCount: number;
  };
  constraintIssues: string[];
  algorithmSpaces: Record<string, GenerationAlgorithmSpace>;
  space: {
    afterManualSelection: number;
    eligibleCombinations: number;
    structuralCoverage: number;
    overallCoverage: number;
  };
}

export interface GenerationBatchAudit {
  sharedCore: number[];
  uniqueNumbers: number[];
  uniqueVariableNumbers: number[];
  averagePairwiseOverlap: number;
  minimumPairwiseOverlap: number;
  maximumPairwiseOverlap: number;
  plan: GenerationPlan;
}

const METHODOLOGY: Record<LotteryId, GenerationMethodologyProfile> = {
  "mega-sena": {
    defaultFixedCount: 3,
    fixedCountOptions: [0, 2, 3],
    preferredOdd: { min: 2, max: 4 },
    preferredRepeated: { min: 0, max: 2 },
    acceptableRepeated: { min: 0, max: 2 },
    notes: [
      "Núcleo padrão de 3 dezenas e 3 variáveis por jogo.",
      "Paridade varia entre 3/3, 4/2 e 2/4; soma é critério secundário.",
    ],
  },
  lotofacil: {
    defaultFixedCount: 8,
    fixedCountOptions: [8, 9, 10],
    preferredOdd: { min: 6, max: 9 },
    preferredRepeated: { min: 8, max: 10 },
    acceptableRepeated: { min: 7, max: 11 },
    notes: [
      "Núcleo entre 8 e 10 dezenas; 8 mantém maior cobertura entre jogos.",
      "Repetição e paridade são estruturais; linhas e colunas não são regras rígidas.",
    ],
  },
  "dia-de-sorte": {
    defaultFixedCount: 3,
    fixedCountOptions: [0, 2, 3],
    preferredOdd: { min: 3, max: 4 },
    preferredRepeated: { min: 1, max: 2 },
    acceptableRepeated: { min: 0, max: 3 },
    notes: [
      "Núcleo padrão de 3 dezenas e 4 variáveis por jogo.",
      "Mês da Sorte é tratado separadamente das sete dezenas.",
    ],
  },
};

export function generationMethodology(lottery: LotteryId): GenerationMethodologyProfile {
  const profile = METHODOLOGY[lottery];
  return {
    ...profile,
    fixedCountOptions: [...profile.fixedCountOptions],
    preferredOdd: { ...profile.preferredOdd },
    preferredRepeated: { ...profile.preferredRepeated },
    acceptableRepeated: { ...profile.acceptableRepeated },
    notes: [...profile.notes],
  };
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

export function scopeGenerationHistory(
  contests: Contest[],
  lottery: LotteryId,
  targetContestNumber?: number,
): { history: Contest[]; targetContestNumber?: number; referenceContest?: Contest; expectedPreviousContestNumber?: number } {
  const scoped = contests
    .filter((contest) => contest.lottery === lottery)
    .sort((a, b) => a.number - b.number);
  const latest = scoped.at(-1);
  const target = targetContestNumber ?? (latest ? latest.number + 1 : undefined);
  const history = target === undefined ? scoped : scoped.filter((contest) => contest.number < target);
  const expectedPreviousContestNumber = target === undefined ? undefined : target - 1;
  const referenceContest = expectedPreviousContestNumber === undefined
    ? history.at(-1)
    : history.find((contest) => contest.number === expectedPreviousContestNumber);
  return {
    history,
    ...(target !== undefined ? { targetContestNumber: target } : {}),
    ...(referenceContest ? { referenceContest } : {}),
    ...(expectedPreviousContestNumber !== undefined ? { expectedPreviousContestNumber } : {}),
  };
}

export function generationHistorySignature(
  contests: Contest[],
  lottery: LotteryId,
  targetContestNumber?: number,
): string {
  const { history } = scopeGenerationHistory(contests, lottery, targetContestNumber);
  const hash = createHash("sha256");
  hash.update(lottery);
  hash.update("|");
  for (const contest of history) {
    hash.update(String(contest.number));
    hash.update("|");
    hash.update(contest.date);
    hash.update("|");
    hash.update([...contest.numbers].sort((a, b) => a - b).join(","));
    hash.update("|");
    hash.update(contest.luckyMonth ?? "");
    hash.update(";");
  }
  return hash.digest("hex");
}

function historyGapCount(history: Contest[]): number {
  let gaps = 0;
  for (let index = 1; index < history.length; index += 1) {
    gaps += Math.max(0, history[index]!.number - history[index - 1]!.number - 1);
  }
  return gaps;
}

export function buildGenerationPlan(
  contests: Contest[],
  lottery: LotteryId,
  options: {
    targetContestNumber?: number;
    fixedNumbers?: number[];
    excludedNumbers?: number[];
    constraints?: GenerationConstraints;
  } = {},
): GenerationPlan {
  const config = getLotteryConfig(lottery);
  const scoped = scopeGenerationHistory(contests, lottery, options.targetContestNumber);
  const { history, referenceContest } = scoped;
  const { fixed, excluded } = validateGenerationSelection(
    lottery,
    options.fixedNumbers ?? [],
    options.excludedNumbers ?? [],
  );
  const constraints = options.constraints ?? {};
  validateGenerationConstraints(lottery, constraints);

  const universe = Array.from(
    { length: config.maxNumber - config.minNumber + 1 },
    (_, index) => config.minNumber + index,
  );
  const totalCombinations = combinationCount(universe.length, config.drawSize);
  const variableCount = config.drawSize - fixed.length;
  const remainingCount = universe.length - fixed.length - excluded.length;
  const afterManualSelection = combinationCount(remainingCount, variableCount);
  const constraintIssues: string[] = [];
  if (constraints.repeated && !referenceContest) {
    constraintIssues.push("Repetição indisponível: o concurso imediatamente anterior ao alvo não está armazenado.");
  }
  const eligibleCombinations = constraintIssues.length > 0
    ? 0
    : countEligibleGenerationCombinations(lottery, fixed, excluded, referenceContest, constraints);
  const methodology = generationMethodology(lottery);
  const analysis = history.length > 0 ? buildNumberAnalysis(history, config) : [];
  const numberTiers: Record<NumberTier, number[]> = {
    strong: analysis.filter((row) => row.tier === "strong").map((row) => row.number),
    balanced: analysis.filter((row) => row.tier === "balanced").map((row) => row.number),
    cold: analysis.filter((row) => row.tier === "cold").map((row) => row.number),
  };
  const lotteryBaseline = buildConditionalBaseline(universe, config.drawSize, [], [], referenceContest, totalCombinations);
  const baseline = buildConditionalBaseline(universe, config.drawSize, fixed, excluded, referenceContest, totalCombinations);
  const previousContestAvailable = scoped.expectedPreviousContestNumber !== undefined && Boolean(referenceContest);

  return {
    lottery,
    historyCount: history.length,
    historySignature: generationHistorySignature(contests, lottery, options.targetContestNumber),
    ...(referenceContest ? { referenceContestNumber: referenceContest.number } : {}),
    ...(scoped.targetContestNumber !== undefined ? { targetContestNumber: scoped.targetContestNumber } : {}),
    universeSize: universe.length,
    drawSize: config.drawSize,
    fixedNumbers: fixed,
    excludedNumbers: excluded,
    constraints,
    methodology,
    numberTiers,
    lotteryBaseline,
    baseline,
    dataQuality: {
      previousContestAvailable,
      ...(scoped.expectedPreviousContestNumber !== undefined
        ? { expectedPreviousContestNumber: scoped.expectedPreviousContestNumber }
        : {}),
      ...(!previousContestAvailable && scoped.expectedPreviousContestNumber !== undefined
        ? { missingPreviousContestNumber: scoped.expectedPreviousContestNumber }
        : {}),
      historyGapCount: historyGapCount(history),
    },
    constraintIssues,
    algorithmSpaces: buildGenerationAlgorithmSpaces(
      lottery,
      methodology.fixedCountOptions,
      universe.length,
      config.drawSize,
      fixed.length,
      excluded.length,
    ),
    space: {
      afterManualSelection,
      eligibleCombinations,
      structuralCoverage: afterManualSelection === 0 ? 0 : eligibleCombinations / afterManualSelection,
      overallCoverage: totalCombinations === 0 ? 0 : eligibleCombinations / totalCombinations,
    },
  };
}

export function matchesGenerationConstraints(
  game: GeneratedGame,
  constraints: GenerationConstraints | undefined,
): boolean {
  if (!constraints) return true;
  return (
    withinGenerationRange(game.metadata.odd, constraints.odd) &&
    withinGenerationRange(game.metadata.repeatedFromLastContest.length, constraints.repeated) &&
    withinGenerationRange(game.metadata.sum, constraints.sum)
  );
}

export function buildGenerationBatchAudit(
  games: GeneratedGame[],
  plan: GenerationPlan,
): GenerationBatchAudit {
  if (games.length === 0) {
    return {
      sharedCore: [],
      uniqueNumbers: [],
      uniqueVariableNumbers: [],
      averagePairwiseOverlap: 0,
      minimumPairwiseOverlap: 0,
      maximumPairwiseOverlap: 0,
      plan,
    };
  }

  const sharedCore = games[0]!.numbers.filter((value) => games.every((game) => game.numbers.includes(value)));
  const uniqueNumbers = uniqueSorted(games.flatMap((game) => game.numbers));
  const uniqueVariableNumbers = uniqueSorted(games.flatMap((game) => game.variableNumbers));
  const overlaps: number[] = [];

  for (let left = 0; left < games.length; left += 1) {
    for (let right = left + 1; right < games.length; right += 1) {
      overlaps.push(games[left]!.numbers.filter((value) => games[right]!.numbers.includes(value)).length);
    }
  }

  return {
    sharedCore: uniqueSorted(sharedCore),
    uniqueNumbers,
    uniqueVariableNumbers,
    averagePairwiseOverlap: overlaps.length === 0
      ? games[0]!.numbers.length
      : overlaps.reduce((total, value) => total + value, 0) / overlaps.length,
    minimumPairwiseOverlap: overlaps.length === 0 ? games[0]!.numbers.length : Math.min(...overlaps),
    maximumPairwiseOverlap: overlaps.length === 0 ? games[0]!.numbers.length : Math.max(...overlaps),
    plan,
  };
}
