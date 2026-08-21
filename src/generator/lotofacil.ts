import type { Contest, GeneratedGame } from "../domain/types.js";
import { buildNumberAnalysis } from "../analysis/scoring.js";
import { getLotteryConfig } from "../lotteries/config.js";
import { matchesGenerationConstraints, type GenerationConstraints } from "./planning.js";
import {
  buildMetadata,
  combinationIterator,
  generationRandom,
  gridExtremePenalty,
  scoreMap,
  selectProfiledFixedNumbers,
  selectRankedCandidate,
  topRankedCandidates,
  type GenerationMode,
} from "./shared.js";

const config = getLotteryConfig("lotofacil");

export interface LotofacilGeneratorOptions {
  gameCount?: number;
  fixedCount?: 8 | 9 | 10;
  generationMode?: GenerationMode;
  seed?: string;
  fixedNumbers?: number[];
  excludedNumbers?: number[];
  constraints?: GenerationConstraints;
  referenceContestNumber?: number | null;
}

export function generateLotofacilGames(
  contests: Contest[],
  options: LotofacilGeneratorOptions = {},
): GeneratedGame[] {
  const gameCount = options.gameCount ?? 2;
  const fixedCount = options.fixedCount ?? 8;
  const generationMode = options.generationMode ?? "deterministic";
  const random = generationRandom(generationMode, options.seed);
  const manualFixed = options.fixedNumbers ?? [];
  const excludedNumbers = options.excludedNumbers ?? [];

  if (!Number.isInteger(gameCount) || gameCount < 1) {
    throw new Error("gameCount must be a positive integer");
  }
  if (![8, 9, 10].includes(fixedCount)) {
    throw new Error("Lotofacil fixedCount must be 8, 9 or 10");
  }
  if (manualFixed.length > fixedCount) {
    throw new Error("Manual fixed numbers exceed the configured fixed core");
  }

  const scoped = contests
    .filter((contest) => contest.lottery === "lotofacil")
    .sort((a, b) => a.number - b.number);
  const lastContest = options.referenceContestNumber === undefined
    ? scoped.at(-1)
    : options.referenceContestNumber === null
      ? undefined
      : scoped.find((contest) => contest.number === options.referenceContestNumber);
  const analysis = buildNumberAnalysis(scoped, config);
  const fixedNumbers = selectProfiledFixedNumbers(
    analysis,
    fixedCount,
    lastContest,
    fixedCount,
    random,
    manualFixed,
    excludedNumbers,
  );
  const fixedSet = new Set(fixedNumbers);
  const excludedSet = new Set(excludedNumbers);
  const scores = scoreMap(analysis);
  const variableCount = config.drawSize - fixedCount;
  const candidatePool = analysis
    .filter((row) => !fixedSet.has(row.number) && !excludedSet.has(row.number))
    .sort((a, b) => b.score - a.score || a.number - b.number)
    .map((row) => row.number);

  const usedVariables = new Map<number, number>();
  const repeatTargets = [8, 9, 10, 8];
  const oddTargets = [8, 7, 9, 6];
  const games: GeneratedGame[] = [];

  for (let gameIndex = 0; gameIndex < gameCount; gameIndex += 1) {
    const targetRepeat = lastContest ? repeatTargets[gameIndex % repeatTargets.length]! : 0;
    const targetOdd = oddTargets[gameIndex % oddTargets.length]!;

    const candidates = function* () {
      for (const variableNumbers of combinationIterator(candidatePool, variableCount)) {
        const numbers = [...fixedNumbers, ...variableNumbers].sort((a, b) => a - b);
        const metadata = buildMetadata(numbers, lastContest, true);
        const game: GeneratedGame = {
          lottery: "lotofacil",
          numbers,
          fixedNumbers,
          variableNumbers,
          metadata,
        };
        if (!matchesGenerationConstraints(game, options.constraints)) continue;

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
        const linePenalty = gridExtremePenalty(metadata.lineDistribution);
        const columnPenalty = gridExtremePenalty(metadata.columnDistribution);
        const reusePenalty = reused * 28;

        yield {
          variableNumbers,
          numbers,
          metadata,
          rank:
            variableScore -
            repeatPenalty -
            parityPenalty -
            linePenalty -
            columnPenalty -
            reusePenalty,
        };
      }
    };

    const ranked = topRankedCandidates(
      candidates(),
      24,
      (a, b) =>
        b.rank - a.rank ||
        a.numbers.join("-").localeCompare(b.numbers.join("-")),
    );
    const winner = selectRankedCandidate(ranked, generationMode, random, 6);
    if (!winner) throw new Error("Unable to generate a Lotofacil game with the requested constraints");

    for (const number of winner.variableNumbers) {
      usedVariables.set(number, (usedVariables.get(number) ?? 0) + 1);
    }

    games.push({
      lottery: "lotofacil",
      numbers: winner.numbers,
      fixedNumbers: [...fixedNumbers],
      variableNumbers: [...winner.variableNumbers].sort((a, b) => a - b),
      metadata: winner.metadata,
    });
  }

  return games;
}
