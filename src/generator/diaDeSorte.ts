import type { Contest, GeneratedGame } from "../domain/types.js";
import { buildNumberAnalysis } from "../analysis/scoring.js";
import { getLotteryConfig } from "../lotteries/config.js";
import {
  buildMetadata,
  combinations,
  generationRandom,
  scoreMap,
  selectProfiledFixedNumbers,
  selectRankedCandidate,
  type GenerationMode,
} from "./shared.js";

const config = getLotteryConfig("dia-de-sorte");

export type DiaDeSorteFixedCount = 0 | 2 | 3;

export interface DiaDeSorteGeneratorOptions {
  gameCount?: number;
  fixedCount?: DiaDeSorteFixedCount;
  generationMode?: GenerationMode;
  seed?: string;
}

const LUCKY_MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

function canonicalLuckyMonth(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLocaleLowerCase("pt-BR");
  return LUCKY_MONTHS.find(
    (month) => month.toLocaleLowerCase("pt-BR") === normalized,
  );
}

export function rankLuckyMonths(contests: Contest[]): string[] {
  const scoped = contests
    .filter((contest) => contest.lottery === "dia-de-sorte")
    .sort((a, b) => a.number - b.number);
  const referenceYear = scoped.at(-1)?.date.slice(0, 4);
  const historical = new Map<string, number>();
  const currentYear = new Map<string, number>();

  for (const contest of scoped) {
    const month = canonicalLuckyMonth(contest.luckyMonth);
    if (!month) continue;
    historical.set(month, (historical.get(month) ?? 0) + 1);
    if (referenceYear && contest.date.startsWith(referenceYear)) {
      currentYear.set(month, (currentYear.get(month) ?? 0) + 1);
    }
  }

  return [...LUCKY_MONTHS].sort((a, b) => {
    const aScore = (currentYear.get(a) ?? 0) * 3 + (historical.get(a) ?? 0);
    const bScore = (currentYear.get(b) ?? 0) * 3 + (historical.get(b) ?? 0);
    return bScore - aScore || a.localeCompare(b, "pt-BR");
  });
}

interface NormalizedDiaDeSorteGeneratorOptions {
  gameCount: number;
  fixedCount: DiaDeSorteFixedCount;
  generationMode: GenerationMode;
  seed?: string;
}

function normalizeOptions(
  value: number | DiaDeSorteGeneratorOptions,
): NormalizedDiaDeSorteGeneratorOptions {
  if (typeof value === "number") {
    return { gameCount: value, fixedCount: 3, generationMode: "deterministic" };
  }
  return {
    gameCount: value.gameCount ?? 2,
    fixedCount: value.fixedCount ?? 3,
    generationMode: value.generationMode ?? "deterministic",
    ...(value.seed !== undefined ? { seed: value.seed } : {}),
  };
}

export function generateDiaDeSorteGames(
  contests: Contest[],
  options: number | DiaDeSorteGeneratorOptions = 2,
): GeneratedGame[] {
  const { gameCount, fixedCount, generationMode, seed } = normalizeOptions(options);
  if (!Number.isInteger(gameCount) || gameCount < 1) {
    throw new Error("gameCount must be a positive integer");
  }
  if (![0, 2, 3].includes(fixedCount)) {
    throw new Error("Dia de Sorte fixedCount must be 0, 2 or 3");
  }

  const random = generationRandom(generationMode, seed);
  const scoped = contests
    .filter((contest) => contest.lottery === "dia-de-sorte")
    .sort((a, b) => a.number - b.number);
  const lastContest = scoped.at(-1);
  const analysis = buildNumberAnalysis(scoped, config);
  const fixedNumbers = fixedCount === 0
    ? []
    : selectProfiledFixedNumbers(
      analysis,
      fixedCount,
      lastContest,
      Math.min(1, fixedCount),
      random,
    );
  const fixedSet = new Set(fixedNumbers);
  const scores = scoreMap(analysis);
  const variableCount = config.drawSize - fixedCount;
  const poolSize = fixedCount === 0 ? 13 : fixedCount === 2 ? 14 : 18;
  const candidatePool = analysis
    .filter((row) => !fixedSet.has(row.number))
    .sort((a, b) => b.score - a.score || a.number - b.number)
    .slice(0, poolSize)
    .map((row) => row.number);
  const variableOptions = combinations(candidatePool, variableCount);
  const usedVariables = new Map<number, number>();
  const repeatTargets = [1, 2, 1, 2];
  const oddTargets = [3, 4, 3, 4];
  const luckyMonths = rankLuckyMonths(scoped);
  const games: GeneratedGame[] = [];

  for (let gameIndex = 0; gameIndex < gameCount; gameIndex += 1) {
    const targetRepeat = lastContest ? repeatTargets[gameIndex % repeatTargets.length]! : 0;
    const targetOdd = oddTargets[gameIndex % oddTargets.length]!;

    const ranked = variableOptions
      .map((variableNumbers) => {
        const numbers = [...fixedNumbers, ...variableNumbers].sort((a, b) => a - b);
        const metadata = buildMetadata(numbers, lastContest);
        const variableScore = variableNumbers.reduce(
          (total, number) => total + (scores.get(number) ?? 0),
          0,
        );
        const reused = variableNumbers.reduce(
          (total, number) => total + (usedVariables.get(number) ?? 0),
          0,
        );
        const repeatPenalty = Math.abs(
          metadata.repeatedFromLastContest.length - targetRepeat,
        ) * 35;
        const parityPenalty = Math.abs(metadata.odd - targetOdd) * 22;
        const sumPenalty = Math.abs(metadata.sum - 112) * 0.25;
        const reusePenalty = reused * 45;

        return {
          variableNumbers,
          numbers,
          metadata,
          rank:
            variableScore -
            repeatPenalty -
            parityPenalty -
            sumPenalty -
            reusePenalty,
        };
      })
      .sort(
        (a, b) =>
          b.rank - a.rank ||
          a.numbers.join("-").localeCompare(b.numbers.join("-")),
      );

    const winner = selectRankedCandidate(ranked, generationMode, random, 6);
    if (!winner) throw new Error("Unable to generate a Dia de Sorte game");

    for (const number of winner.variableNumbers) {
      usedVariables.set(number, (usedVariables.get(number) ?? 0) + 1);
    }

    games.push({
      lottery: "dia-de-sorte",
      numbers: winner.numbers,
      fixedNumbers: [...fixedNumbers],
      variableNumbers: [...winner.variableNumbers].sort((a, b) => a - b),
      luckyMonth: luckyMonths[gameIndex % luckyMonths.length],
      metadata: winner.metadata,
    });
  }

  return games;
}
