import type { Contest, GeneratedGame, NumberAnalysis } from "../domain/types.js";
import { getLotteryConfig } from "../lotteries/config.js";
import { buildNumberAnalysis } from "../analysis/scoring.js";
import {
  GUILHERMINO_HIGH_FREQUENCY_GROUP,
  matchesMegaSenaRules,
  megaSenaColumn,
  megaSenaQuadrant,
  type MegaSenaGameRules,
} from "./megaSenaRules.js";
import { matchesGenerationConstraints, type GenerationConstraints } from "./planning.js";
import {
  combinationIterator,
  generationRandom,
  selectRankedCandidate,
  selectWeightedItem,
  topRankedCandidates,
  type GenerationMode,
} from "./shared.js";

const config = getLotteryConfig("mega-sena");
const preferredGroup = new Set<number>(GUILHERMINO_HIGH_FREQUENCY_GROUP);

export type MegaSenaFixedCount = 0 | 2 | 3;

export interface MegaSenaGeneratorOptions {
  gameCount?: number;
  fixedCount?: MegaSenaFixedCount;
  generationMode?: GenerationMode;
  seed?: string;
  rules?: MegaSenaGameRules;
  fixedNumbers?: number[];
  excludedNumbers?: number[];
  constraints?: GenerationConstraints;
  referenceContestNumber?: number | null;
}

function bestUnused(
  analysis: NumberAnalysis[],
  selected: Set<number>,
  excluded: Set<number>,
  value: (row: NumberAnalysis) => number,
  random?: () => number,
): number {
  const ranked = [...analysis]
    .filter((row) => !selected.has(row.number) && !excluded.has(row.number))
    .sort((a, b) => value(b) - value(a) || b.score - a.score || a.number - b.number);
  const candidate = random ? selectWeightedItem(ranked, random, 6) : ranked[0];

  if (!candidate) throw new Error("Unable to select a Mega-Sena fixed number");
  selected.add(candidate.number);
  return candidate.number;
}

export function selectMegaSenaFixedNumbers(
  analysis: NumberAnalysis[],
  count: MegaSenaFixedCount = 3,
  random?: () => number,
  presetNumbers: number[] = [],
  excludedNumbers: number[] = [],
): number[] {
  if (![0, 2, 3].includes(count)) {
    throw new Error("Mega-Sena fixedCount must be 0, 2 or 3");
  }
  if (new Set(presetNumbers).size !== presetNumbers.length) throw new Error("Fixed numbers must be unique");
  if (presetNumbers.length > count) throw new Error("Manual fixed numbers exceed the configured fixed core");
  const available = new Set(analysis.map((row) => row.number));
  const excluded = new Set(excludedNumbers);
  if (presetNumbers.some((number) => !available.has(number))) throw new Error("Manual fixed number is outside the Mega-Sena universe");
  if (excludedNumbers.some((number) => !available.has(number))) throw new Error("Excluded number is outside the Mega-Sena universe");
  if (presetNumbers.some((number) => excluded.has(number))) throw new Error("A number cannot be fixed and excluded at the same time");
  if (count === 0) return [];

  const selected = new Set<number>(presetNumbers);
  if (selected.size < count) bestUnused(analysis, selected, excluded, (row) => row.year, random);
  if (selected.size < count) {
    bestUnused(analysis, selected, excluded, (row) => row.historical * 0.5 + row.year * 0.5, random);
  }
  if (selected.size < count) {
    bestUnused(analysis, selected, excluded, (row) => row.recent10 * 0.6 + row.month * 0.4, random);
  }

  return [...selected].sort((a, b) => a - b);
}

function buildMetadata(numbers: number[], lastContest?: Contest): GeneratedGame["metadata"] {
  const odd = numbers.filter((number) => number % 2 !== 0).length;
  const repeatedFromLastContest = lastContest
    ? numbers.filter((number) => lastContest.numbers.includes(number))
    : [];

  return {
    odd,
    even: numbers.length - odd,
    sum: numbers.reduce((total, number) => total + number, 0),
    repeatedFromLastContest,
  };
}

interface NormalizedMegaSenaGeneratorOptions {
  gameCount: number;
  fixedCount: MegaSenaFixedCount;
  generationMode: GenerationMode;
  seed?: string;
  rules: MegaSenaGameRules;
  fixedNumbers: number[];
  excludedNumbers: number[];
  constraints?: GenerationConstraints;
  referenceContestNumber?: number | null;
}

function normalizeOptions(
  value: number | MegaSenaGeneratorOptions,
): NormalizedMegaSenaGeneratorOptions {
  if (typeof value === "number") {
    return { gameCount: value, fixedCount: 3, generationMode: "deterministic", rules: {}, fixedNumbers: [], excludedNumbers: [] };
  }
  return {
    gameCount: value.gameCount ?? 2,
    fixedCount: value.fixedCount ?? 3,
    generationMode: value.generationMode ?? "deterministic",
    ...(value.seed !== undefined ? { seed: value.seed } : {}),
    rules: value.rules ?? {},
    fixedNumbers: value.fixedNumbers ?? [],
    excludedNumbers: value.excludedNumbers ?? [],
    ...(value.constraints !== undefined ? { constraints: value.constraints } : {}),
    ...(value.referenceContestNumber !== undefined ? { referenceContestNumber: value.referenceContestNumber } : {}),
  };
}

function hasRules(rules: MegaSenaGameRules): boolean {
  return Object.values(rules).some((value) => value !== undefined && value !== false);
}

function buildCandidatePool(
  analysis: NumberAnalysis[],
  fixedSet: Set<number>,
  excludedSet: Set<number>,
  fixedCount: MegaSenaFixedCount,
  rules: MegaSenaGameRules,
): number[] {
  const ranked = [...analysis]
    .filter((row) => !fixedSet.has(row.number) && !excludedSet.has(row.number))
    .sort((a, b) => b.score - a.score || a.number - b.number);

  if (fixedCount !== 0 || !hasRules(rules)) {
    const poolSize = fixedCount === 0 ? 14 : fixedCount === 2 ? 18 : 24;
    return ranked.slice(0, poolSize).map((row) => row.number);
  }

  const selected = new Set<number>();

  if (rules.minPreferredGroup !== undefined) {
    const wanted = rules.minPreferredGroup + 3;
    let added = 0;
    for (const row of ranked) {
      if (!preferredGroup.has(row.number)) continue;
      selected.add(row.number);
      added += 1;
      if (added >= wanted) break;
    }
  }

  if (rules.minQuadrants !== undefined) {
    for (const quadrant of [1, 2, 3, 4] as const) {
      let added = 0;
      for (const row of ranked) {
        if (megaSenaQuadrant(row.number) !== quadrant) continue;
        selected.add(row.number);
        added += 1;
        if (added >= 2) break;
      }
    }
  }

  if (rules.equalParity) {
    for (const parity of [0, 1] as const) {
      let added = 0;
      for (const row of ranked) {
        if (row.number % 2 !== parity) continue;
        selected.add(row.number);
        added += 1;
        if (added >= 4) break;
      }
    }
  }

  if (rules.avoidSameColumn) {
    const represented = new Set<number>();
    for (const row of ranked) {
      const column = megaSenaColumn(row.number);
      if (represented.has(column)) continue;
      selected.add(row.number);
      represented.add(column);
      if (represented.size >= 6) break;
    }
  }

  const targetSize = Math.max(18, selected.size);
  for (const row of ranked) {
    selected.add(row.number);
    if (selected.size >= targetSize) break;
  }

  return [...selected];
}

export function generateMegaSenaGames(
  contests: Contest[],
  options: number | MegaSenaGeneratorOptions = 2,
): GeneratedGame[] {
  const {
    gameCount,
    fixedCount,
    generationMode,
    seed,
    rules,
    fixedNumbers: manualFixed,
    excludedNumbers,
    constraints,
    referenceContestNumber,
  } = normalizeOptions(options);
  if (!Number.isInteger(gameCount) || gameCount < 1) {
    throw new Error("gameCount must be a positive integer");
  }
  if (![0, 2, 3].includes(fixedCount)) {
    throw new Error("Mega-Sena fixedCount must be 0, 2 or 3");
  }

  const random = generationRandom(generationMode, seed);
  const scoped = contests
    .filter((contest) => contest.lottery === "mega-sena")
    .sort((a, b) => a.number - b.number);
  const analysis = buildNumberAnalysis(scoped, config);
  const lastContest = referenceContestNumber === undefined
    ? scoped.at(-1)
    : referenceContestNumber === null
      ? undefined
      : scoped.find((contest) => contest.number === referenceContestNumber);
  const fixedNumbers = selectMegaSenaFixedNumbers(analysis, fixedCount, random, manualFixed, excludedNumbers);
  const fixedSet = new Set(fixedNumbers);
  const excludedSet = new Set(excludedNumbers);
  const scoreByNumber = new Map(analysis.map((row) => [row.number, row.score]));
  const variableCount = config.drawSize - fixedCount;
  const candidatePool = buildCandidatePool(analysis, fixedSet, excludedSet, fixedCount, rules);
  const usedVariables = new Map<number, number>();
  const parityTargets = [3, 4, 2];
  const games: GeneratedGame[] = [];

  for (let gameIndex = 0; gameIndex < gameCount; gameIndex += 1) {
    const targetOdd = rules.equalParity ? 3 : parityTargets[gameIndex % parityTargets.length]!;

    const candidates = function* () {
      for (const variableNumbers of combinationIterator(candidatePool, variableCount)) {
        const numbers = [...fixedNumbers, ...variableNumbers].sort((a, b) => a - b);
        if (!matchesMegaSenaRules(numbers, rules)) continue;

        const metadata = buildMetadata(numbers, lastContest);
        const game: GeneratedGame = {
          lottery: "mega-sena",
          numbers,
          fixedNumbers,
          variableNumbers,
          metadata,
        };
        if (!matchesGenerationConstraints(game, constraints)) continue;

        const baseScore = variableNumbers.reduce(
          (total, number) => total + (scoreByNumber.get(number) ?? 0),
          0,
        );
        const reused = variableNumbers.reduce(
          (total, number) => total + (usedVariables.get(number) ?? 0),
          0,
        );
        const parityPenalty = Math.abs(metadata.odd - targetOdd) * 20;
        const repeatPenalty = Math.max(0, metadata.repeatedFromLastContest.length - 2) * 30;
        const reusePenalty = reused * 80;

        yield {
          variableNumbers,
          numbers,
          metadata,
          rank: baseScore - parityPenalty - repeatPenalty - reusePenalty,
        };
      }
    };

    const ranked = topRankedCandidates(
      candidates(),
      24,
      (a, b) => b.rank - a.rank || a.numbers.join("-").localeCompare(b.numbers.join("-")),
    );
    const winner = selectRankedCandidate(ranked, generationMode, random, 6);
    if (!winner) {
      throw new Error("Unable to generate a Mega-Sena game with the requested constraints");
    }

    for (const number of winner.variableNumbers) {
      usedVariables.set(number, (usedVariables.get(number) ?? 0) + 1);
    }
    games.push({
      lottery: "mega-sena",
      numbers: winner.numbers,
      fixedNumbers: [...fixedNumbers],
      variableNumbers: [...winner.variableNumbers].sort((a, b) => a - b),
      metadata: winner.metadata,
    });
  }

  return games;
}
