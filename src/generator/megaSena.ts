import type { Contest, GeneratedGame, NumberAnalysis } from "../domain/types.js";
import { getLotteryConfig } from "../lotteries/config.js";
import { buildNumberAnalysis } from "../analysis/scoring.js";
import {
  matchesMegaSenaRules,
  type MegaSenaGameRules,
} from "./megaSenaRules.js";
import {
  generationRandom,
  selectRankedCandidate,
  type GenerationMode,
} from "./shared.js";

const config = getLotteryConfig("mega-sena");

export type MegaSenaFixedCount = 0 | 2 | 3;

export interface MegaSenaGeneratorOptions {
  gameCount?: number;
  fixedCount?: MegaSenaFixedCount;
  generationMode?: GenerationMode;
  seed?: string;
  rules?: MegaSenaGameRules;
}

function bestUnused(
  analysis: NumberAnalysis[],
  selected: Set<number>,
  value: (row: NumberAnalysis) => number,
): number {
  const candidate = [...analysis]
    .filter((row) => !selected.has(row.number))
    .sort((a, b) => value(b) - value(a) || b.score - a.score || a.number - b.number)[0];

  if (!candidate) throw new Error("Unable to select a Mega-Sena fixed number");
  selected.add(candidate.number);
  return candidate.number;
}

export function selectMegaSenaFixedNumbers(
  analysis: NumberAnalysis[],
  count: MegaSenaFixedCount = 3,
): number[] {
  if (![0, 2, 3].includes(count)) {
    throw new Error("Mega-Sena fixedCount must be 0, 2 or 3");
  }
  if (count === 0) return [];

  const selected = new Set<number>();
  bestUnused(analysis, selected, (row) => row.year);
  if (selected.size < count) {
    bestUnused(analysis, selected, (row) => row.historical * 0.5 + row.year * 0.5);
  }
  if (selected.size < count) {
    bestUnused(analysis, selected, (row) => row.recent10 * 0.6 + row.month * 0.4);
  }

  return [...selected].sort((a, b) => a - b);
}

function combinations<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  function walk(start: number, current: T[]): void {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      current.push(items[index]!);
      walk(index + 1, current);
      current.pop();
    }
  }

  walk(0, []);
  return result;
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
}

function normalizeOptions(
  value: number | MegaSenaGeneratorOptions,
): NormalizedMegaSenaGeneratorOptions {
  if (typeof value === "number") {
    return { gameCount: value, fixedCount: 3, generationMode: "deterministic", rules: {} };
  }
  return {
    gameCount: value.gameCount ?? 2,
    fixedCount: value.fixedCount ?? 3,
    generationMode: value.generationMode ?? "deterministic",
    ...(value.seed !== undefined ? { seed: value.seed } : {}),
    rules: value.rules ?? {},
  };
}

function hasRules(rules: MegaSenaGameRules): boolean {
  return Object.values(rules).some((value) => value !== undefined && value !== false);
}

export function generateMegaSenaGames(
  contests: Contest[],
  options: number | MegaSenaGeneratorOptions = 2,
): GeneratedGame[] {
  const { gameCount, fixedCount, generationMode, seed, rules } = normalizeOptions(options);
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
  const fixedNumbers = selectMegaSenaFixedNumbers(analysis, fixedCount);
  const fixedSet = new Set(fixedNumbers);
  const lastContest = scoped.at(-1);
  const scoreByNumber = new Map(analysis.map((row) => [row.number, row.score]));
  const variableCount = config.drawSize - fixedCount;
  const poolSize = fixedCount === 0
    ? (hasRules(rules) ? 18 : 14)
    : fixedCount === 2
      ? 18
      : 24;
  const candidatePool = [...analysis]
    .filter((row) => !fixedSet.has(row.number))
    .sort((a, b) => b.score - a.score || a.number - b.number)
    .slice(0, poolSize)
    .map((row) => row.number);

  const variableOptions = combinations(candidatePool, variableCount);
  const usedVariables = new Map<number, number>();
  const parityTargets = [3, 4, 2];
  const games: GeneratedGame[] = [];

  for (let gameIndex = 0; gameIndex < gameCount; gameIndex += 1) {
    const targetOdd = rules.equalParity ? 3 : parityTargets[gameIndex % parityTargets.length]!;

    const ranked = variableOptions
      .map((variableNumbers) => {
        const numbers = [...fixedNumbers, ...variableNumbers].sort((a, b) => a - b);
        if (!matchesMegaSenaRules(numbers, rules)) return undefined;

        const metadata = buildMetadata(numbers, lastContest);
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

        return {
          variableNumbers,
          numbers,
          metadata,
          rank: baseScore - parityPenalty - repeatPenalty - reusePenalty,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined)
      .sort((a, b) => b.rank - a.rank || a.numbers.join("-").localeCompare(b.numbers.join("-")));

    const winner = selectRankedCandidate(ranked, generationMode, random, 6);
    if (!winner) {
      throw new Error("Unable to generate a Mega-Sena game with the requested experimental rules");
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
