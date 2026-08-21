import type { Contest, GeneratedGame, LotteryId } from "../domain/types.js";
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

export interface GenerationPlan {
  lottery: LotteryId;
  historyCount: number;
  referenceContestNumber?: number;
  targetContestNumber?: number;
  universeSize: number;
  drawSize: number;
  fixedNumbers: number[];
  excludedNumbers: number[];
  constraints: GenerationConstraints;
  methodology: GenerationMethodologyProfile;
  baseline: {
    totalCombinations: number;
    expectedOdd: number;
    expectedRepeated: number | null;
    expectedSum: number;
    sumStdDev: number;
  };
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

function sumBaseline(universeSize: number, drawSize: number): { expected: number; stdDev: number } {
  const mean = (universeSize + 1) / 2;
  const populationVariance = (universeSize * universeSize - 1) / 12;
  const variance = drawSize * populationVariance * ((universeSize - drawSize) / (universeSize - 1));
  return { expected: mean * drawSize, stdDev: Math.sqrt(Math.max(0, variance)) };
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

function within(value: number, range: GenerationRange | undefined): boolean {
  return !range || (value >= range.min && value <= range.max);
}

function countEligible(
  lottery: LotteryId,
  fixed: number[],
  excluded: number[],
  lastContest: Contest | undefined,
  constraints: GenerationConstraints,
): number {
  const config = getLotteryConfig(lottery);
  const fixedSet = new Set(fixed);
  const excludedSet = new Set(excluded);
  const lastSet = new Set(lastContest?.numbers ?? []);
  const needed = config.drawSize - fixed.length;
  const fixedOdd = fixed.filter((value) => value % 2 !== 0).length;
  const fixedRepeated = fixed.filter((value) => lastSet.has(value)).length;
  const fixedSum = fixed.reduce((total, value) => total + value, 0);

  if (!within(fixedOdd, constraints.odd) && constraints.odd && fixedOdd > constraints.odd.max) return 0;
  if (!within(fixedRepeated, constraints.repeated) && constraints.repeated && fixedRepeated > constraints.repeated.max) return 0;
  if (constraints.sum && fixedSum > constraints.sum.max) return 0;

  const candidates = Array.from(
    { length: config.maxNumber - config.minNumber + 1 },
    (_, index) => config.minNumber + index,
  ).filter((value) => !fixedSet.has(value) && !excludedSet.has(value));

  let states = new Map<string, number>([[keyOf({ picked: 0, odd: fixedOdd, repeated: fixedRepeated, sum: fixedSum }), 1]]);

  for (const value of candidates) {
    const next = new Map(states);
    for (const [key, count] of states) {
      const state = parseKey(key);
      if (state.picked >= needed) continue;
      const candidate: DpState = {
        picked: state.picked + 1,
        odd: state.odd + (value % 2 !== 0 ? 1 : 0),
        repeated: state.repeated + (lastSet.has(value) ? 1 : 0),
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
  const history = contests
    .filter((contest) => contest.lottery === lottery)
    .filter((contest) => options.targetContestNumber === undefined || contest.number < options.targetContestNumber)
    .sort((a, b) => a.number - b.number);
  const lastContest = history.at(-1);
  const { fixed, excluded } = validateSelection(
    lottery,
    options.fixedNumbers ?? [],
    options.excludedNumbers ?? [],
  );
  const constraints = options.constraints ?? {};

  assertRange("odd", constraints.odd, 0, config.drawSize);
  assertRange("repeated", constraints.repeated, 0, config.drawSize);
  const minimumSum = Array.from({ length: config.drawSize }, (_, index) => config.minNumber + index)
    .reduce((total, value) => total + value, 0);
  const maximumSum = Array.from({ length: config.drawSize }, (_, index) => config.maxNumber - index)
    .reduce((total, value) => total + value, 0);
  assertRange("sum", constraints.sum, minimumSum, maximumSum);
  if (constraints.repeated && !lastContest) {
    throw new Error("A previous contest is required to constrain repeated numbers");
  }

  const universeSize = config.maxNumber - config.minNumber + 1;
  const variableCount = config.drawSize - fixed.length;
  const afterManualSelection = combinationCount(universeSize - fixed.length - excluded.length, variableCount);
  const eligibleCombinations = countEligible(lottery, fixed, excluded, lastContest, constraints);
  const totalCombinations = combinationCount(universeSize, config.drawSize);
  const sum = sumBaseline(universeSize, config.drawSize);

  return {
    lottery,
    historyCount: history.length,
    ...(lastContest ? { referenceContestNumber: lastContest.number } : {}),
    targetContestNumber: options.targetContestNumber ?? (lastContest ? lastContest.number + 1 : undefined),
    universeSize,
    drawSize: config.drawSize,
    fixedNumbers: fixed,
    excludedNumbers: excluded,
    constraints,
    methodology: generationMethodology(lottery),
    baseline: {
      totalCombinations,
      expectedOdd: config.drawSize * (Math.ceil(universeSize / 2) / universeSize),
      expectedRepeated: lastContest ? (config.drawSize * lastContest.numbers.length) / universeSize : null,
      expectedSum: sum.expected,
      sumStdDev: sum.stdDev,
    },
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
