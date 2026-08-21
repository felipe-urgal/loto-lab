import { createHash } from "node:crypto";
import type { Contest, GeneratedGame, LotteryId, NumberTier } from "../domain/types.js";
import { buildNumberAnalysis } from "../analysis/scoring.js";
import { getLotteryConfig } from "../lotteries/config.js";

export interface GenerationRange {
  min: number;
  max: number;
}

export interface GenerationConstraints {
  odd?: GenerationRange;
  repeated?: GenerationRange;
  sum?: GenerationRange;
}

export interface GenerationMethodologyProfile {
  defaultFixedCount: number;
  fixedCountOptions: number[];
  preferredOdd: GenerationRange;
  preferredRepeated: GenerationRange;
  acceptableRepeated: GenerationRange;
  notes: string[];
}

export interface GenerationBaseline {
  totalCombinations: number;
  expectedOdd: number;
  expectedRepeated: number | null;
  expectedSum: number;
  sumStdDev: number;
}

export interface GenerationAlgorithmSpace {
  fixedCount: number;
  variableCount: number;
  candidatePoolSize: number;
  rawCombinationCapacity: number;
  shortlistLimit: number;
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

export function combinationCount(n: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) return 0;
  const size = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= size; index += 1) {
    result = (result * (n - size + index)) / index;
  }
  return Math.round(result);
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function assertRange(name: string, value: GenerationRange | undefined, minimum: number, maximum: number): void {
  if (!value) return;
  if (
    !Number.isInteger(value.min) ||
    !Number.isInteger(value.max) ||
    value.min < minimum ||
    value.max > maximum ||
    value.min > value.max
  ) {
    throw new Error(`${name} must be an integer range between ${minimum} and ${maximum}`);
  }
}

function validateSelection(
  lottery: LotteryId,
  fixedNumbers: number[],
  excludedNumbers: number[],
): { fixed: number[]; excluded: number[] } {
  const config = getLotteryConfig(lottery);
  const fixed = uniqueSorted(fixedNumbers);
  const excluded = uniqueSorted(excludedNumbers);
  const inRange = (value: number) => Number.isInteger(value) && value >= config.minNumber && value <= config.maxNumber;

  if (!fixed.every(inRange) || !excluded.every(inRange)) {
    throw new Error(`Selected numbers must be between ${config.minNumber} and ${config.maxNumber}`);
  }
  if (fixed.length !== fixedNumbers.length || excluded.length !== excludedNumbers.length) {
    throw new Error("Selected numbers must not contain duplicates");
  }
  if (fixed.length > config.drawSize) {
    throw new Error(`At most ${config.drawSize} numbers can be fixed`);
  }
  if (fixed.some((value) => excluded.includes(value))) {
    throw new Error("A number cannot be fixed and excluded at the same time");
  }
  if (config.maxNumber - config.minNumber + 1 - excluded.length < config.drawSize) {
    throw new Error("Too many numbers were excluded to form a valid game");
  }

  return { fixed, excluded };
}

function within(value: number, range: GenerationRange | undefined): boolean {
  return !range || (value >= range.min && value <= range.max);
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

function populationStats(values: number[]): { mean: number; variance: number } {
  if (values.length === 0) return { mean: 0, variance: 0 };
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return { mean, variance };
}

function conditionalBaseline(
  universe: number[],
  drawSize: number,
  fixed: number[],
  excluded: number[],
  referenceContest: Contest | undefined,
  totalCombinations: number,
): GenerationBaseline {
  const fixedSet = new Set(fixed);
  const excludedSet = new Set(excluded);
  const remaining = universe.filter((value) => !fixedSet.has(value) && !excludedSet.has(value));
  const needed = Math.max(0, drawSize - fixed.length);
  const fixedOdd = fixed.filter((value) => value % 2 !== 0).length;
  const remainingOdd = remaining.filter((value) => value % 2 !== 0).length;
  const fixedSum = fixed.reduce((total, value) => total + value, 0);
  const stats = populationStats(remaining);
  const sampleVariance = needed === 0 || remaining.length <= 1
    ? 0
    : needed * stats.variance * ((remaining.length - needed) / (remaining.length - 1));
  const referenceSet = new Set(referenceContest?.numbers ?? []);
  const fixedRepeated = fixed.filter((value) => referenceSet.has(value)).length;
  const remainingRepeated = remaining.filter((value) => referenceSet.has(value)).length;

  return {
    totalCombinations,
    expectedOdd: fixedOdd + (remaining.length === 0 ? 0 : needed * remainingOdd / remaining.length),
    expectedRepeated: referenceContest
      ? fixedRepeated + (remaining.length === 0 ? 0 : needed * remainingRepeated / remaining.length)
      : null,
    expectedSum: fixedSum + needed * stats.mean,
    sumStdDev: Math.sqrt(Math.max(0, sampleVariance)),
  };
}

interface DpState {
  picked: number;
  odd: number;
  repeated: number;
  sum: number;
}

function keyOf(state: DpState): string {
  return `${state.picked}|${state.odd}|${state.repeated}|${state.sum}`;
}

function parseKey(key: string): DpState {
  const [picked, odd, repeated, sum] = key.split("|").map(Number);
  return { picked: picked!, odd: odd!, repeated: repeated!, sum: sum! };
}

function countEligible(
  lottery: LotteryId,
  fixed: number[],
  excluded: number[],
  referenceContest: Contest | undefined,
  constraints: GenerationConstraints,
): number {
  const config = getLotteryConfig(lottery);
  const fixedSet = new Set(fixed);
  const excludedSet = new Set(excluded);
  const referenceSet = new Set(referenceContest?.numbers ?? []);
  const needed = config.drawSize - fixed.length;
  const candidates = Array.from(
    { length: config.maxNumber - config.minNumber + 1 },
    (_, index) => config.minNumber + index,
  ).filter((value) => !fixedSet.has(value) && !excludedSet.has(value));

  if (!constraints.odd && !constraints.repeated && !constraints.sum) {
    return combinationCount(candidates.length, needed);
  }

  const fixedOdd = fixed.filter((value) => value % 2 !== 0).length;
  const fixedRepeated = fixed.filter((value) => referenceSet.has(value)).length;
  const fixedSum = fixed.reduce((total, value) => total + value, 0);

  if (constraints.odd && fixedOdd > constraints.odd.max) return 0;
  if (constraints.repeated && fixedRepeated > constraints.repeated.max) return 0;
  if (constraints.sum && fixedSum > constraints.sum.max) return 0;

  let states = new Map<string, number>([[keyOf({ picked: 0, odd: fixedOdd, repeated: fixedRepeated, sum: fixedSum }), 1]]);

  for (const value of candidates) {
    const next = new Map(states);
    for (const [key, count] of states) {
      const state = parseKey(key);
      if (state.picked >= needed) continue;
      const candidate: DpState = {
        picked: state.picked + 1,
        odd: state.odd + (value % 2 !== 0 ? 1 : 0),
        repeated: state.repeated + (referenceSet.has(value) ? 1 : 0),
        sum: state.sum + value,
      };
      if (constraints.odd && candidate.odd > constraints.odd.max) continue;
      if (constraints.repeated && candidate.repeated > constraints.repeated.max) continue;
      if (constraints.sum && candidate.sum > constraints.sum.max) continue;
      const candidateKey = keyOf(candidate);
      next.set(candidateKey, (next.get(candidateKey) ?? 0) + count);
    }
    states = next;
  }

  let total = 0;
  for (const [key, count] of states) {
    const state = parseKey(key);
    if (state.picked !== needed) continue;
    if (!within(state.odd, constraints.odd)) continue;
    if (!within(state.repeated, constraints.repeated)) continue;
    if (!within(state.sum, constraints.sum)) continue;
    total += count;
  }
  return total;
}

function algorithmPoolLimit(lottery: LotteryId, fixedCount: number): number {
  if (lottery === "lotofacil") return Number.POSITIVE_INFINITY;
  if (lottery === "mega-sena") return fixedCount === 0 ? 14 : fixedCount === 2 ? 18 : 24;
  return fixedCount === 0 ? 13 : fixedCount === 2 ? 14 : 18;
}

function algorithmSpaces(
  lottery: LotteryId,
  methodology: GenerationMethodologyProfile,
  universeSize: number,
  drawSize: number,
  manualFixedCount: number,
  excludedCount: number,
): Record<string, GenerationAlgorithmSpace> {
  const result: Record<string, GenerationAlgorithmSpace> = {};
  for (const fixedCount of methodology.fixedCountOptions) {
    const variableCount = drawSize - fixedCount;
    const availableAfterCore = Math.max(0, universeSize - excludedCount - fixedCount);
    const poolLimit = algorithmPoolLimit(lottery, fixedCount);
    const candidatePoolSize = manualFixedCount > fixedCount
      ? 0
      : Math.min(availableAfterCore, poolLimit);
    const rawCombinationCapacity = combinationCount(candidatePoolSize, variableCount);
    result[String(fixedCount)] = {
      fixedCount,
      variableCount,
      candidatePoolSize,
      rawCombinationCapacity,
      shortlistLimit: Math.min(24, rawCombinationCapacity),
    };
  }
  return result;
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
  const { fixed, excluded } = validateSelection(
    lottery,
    options.fixedNumbers ?? [],
    options.excludedNumbers ?? [],
  );
  const constraints = options.constraints ?? {};

  assertRange("odd", constraints.odd, 0, config.drawSize);
  assertRange("repeated", constraints.repeated, 0, config.drawSize);
  const universe = Array.from(
    { length: config.maxNumber - config.minNumber + 1 },
    (_, index) => config.minNumber + index,
  );
  const minimumSum = universe.slice(0, config.drawSize).reduce((total, value) => total + value, 0);
  const maximumSum = universe.slice(-config.drawSize).reduce((total, value) => total + value, 0);
  assertRange("sum", constraints.sum, minimumSum, maximumSum);

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
    : countEligible(lottery, fixed, excluded, referenceContest, constraints);
  const methodology = generationMethodology(lottery);
  const analysis = history.length > 0 ? buildNumberAnalysis(history, config) : [];
  const numberTiers: Record<NumberTier, number[]> = {
    strong: analysis.filter((row) => row.tier === "strong").map((row) => row.number),
    balanced: analysis.filter((row) => row.tier === "balanced").map((row) => row.number),
    cold: analysis.filter((row) => row.tier === "cold").map((row) => row.number),
  };
  const lotteryBaseline = conditionalBaseline(universe, config.drawSize, [], [], referenceContest, totalCombinations);
  const baseline = conditionalBaseline(universe, config.drawSize, fixed, excluded, referenceContest, totalCombinations);
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
    algorithmSpaces: algorithmSpaces(
      lottery,
      methodology,
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
    within(game.metadata.odd, constraints.odd) &&
    within(game.metadata.repeatedFromLastContest.length, constraints.repeated) &&
    within(game.metadata.sum, constraints.sum)
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
