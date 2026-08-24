import type { AnalysisModel, Contest, GeneratedGame } from "../domain/types.js";
import { buildNumberAnalysis } from "../analysis/scoring.js";
import { getLotteryConfig } from "../lotteries/config.js";
import { matchesGenerationConstraints, type GenerationConstraints } from "./planning.js";
import { selectPortfolioCandidates } from "./portfolio.js";
import {
  buildMetadata,
  combinationIterator,
  createStableNumberTieBreaker,
  GENERATION_POLICY,
  generationRandom,
  gridExtremePenalty,
  scoreMap,
  selectProfiledFixedNumbers,
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
  analysisModel?: AnalysisModel;
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
  const analysisModel = options.analysisModel ?? "score-v2";

  if (!Number.isInteger(gameCount) || gameCount < 1) throw new Error("gameCount must be a positive integer");
  if (![8, 9, 10].includes(fixedCount)) throw new Error("Lotofacil fixedCount must be 8, 9 or 10");
  if (manualFixed.length > fixedCount) throw new Error("Manual fixed numbers exceed the configured fixed core");

  const scoped = contests.filter((contest) => contest.lottery === "lotofacil").sort((a, b) => a.number - b.number);
  const lastContest = options.referenceContestNumber === undefined
    ? scoped.at(-1)
    : options.referenceContestNumber === null
      ? undefined
      : scoped.find((contest) => contest.number === options.referenceContestNumber);
  const analysis = buildNumberAnalysis(scoped, config, undefined, analysisModel);
  const tieBreaker = analysisModel === "no-score"
    ? createStableNumberTieBreaker(`no-score:lotofacil:${scoped.at(-1)?.number ?? 0}`)
    : undefined;
  const neutralRank = tieBreaker
    ? new Map([...analysis].sort((a, b) => tieBreaker(a.number, b.number)).map((row, index) => [row.number, index]))
    : undefined;
  const tieKeyFor = (numbers: number[]) => neutralRank
    ? numbers.map((number) => neutralRank.get(number) ?? number).sort((a, b) => a - b).map((value) => String(value).padStart(3, "0")).join("-")
    : undefined;

  const fixedNumbers = selectProfiledFixedNumbers(
    analysis,
    fixedCount,
    lastContest,
    fixedCount,
    random,
    manualFixed,
    excludedNumbers,
    tieBreaker,
  );
  const fixedSet = new Set(fixedNumbers);
  const excludedSet = new Set(excludedNumbers);
  const scores = scoreMap(analysis);
  const variableCount = config.drawSize - fixedCount;
  const candidatePool = analysis
    .filter((row) => !fixedSet.has(row.number) && !excludedSet.has(row.number))
    .sort((a, b) => b.score - a.score || (tieBreaker ? tieBreaker(a.number, b.number) : a.number - b.number))
    .map((row) => row.number);

  const repeatTargets = [8, 9, 10, 8];
  const oddTargets = [8, 7, 9, 6];
  const policy = GENERATION_POLICY.lotofacil;

  const candidateGroups = Array.from({ length: gameCount }, (_, gameIndex) => {
    const targetRepeat = lastContest ? repeatTargets[gameIndex % repeatTargets.length]! : 0;
    const targetOdd = oddTargets[gameIndex % oddTargets.length]!;
    const candidates = function* () {
      for (const variableNumbers of combinationIterator(candidatePool, variableCount)) {
        const numbers = [...fixedNumbers, ...variableNumbers].sort((a, b) => a - b);
        const metadata = buildMetadata(numbers, lastContest, true);
        const game: GeneratedGame = { lottery: "lotofacil", numbers, fixedNumbers, variableNumbers, metadata };
        if (!matchesGenerationConstraints(game, options.constraints)) continue;
        const variableScore = variableNumbers.reduce((total, number) => total + (scores.get(number) ?? 0), 0);
        const repeatPenalty = Math.abs(metadata.repeatedFromLastContest.length - targetRepeat) * policy.repeatDistancePenalty;
        const parityPenalty = Math.abs(metadata.odd - targetOdd) * policy.parityDistancePenalty;
        const linePenalty = gridExtremePenalty(metadata.lineDistribution);
        const columnPenalty = gridExtremePenalty(metadata.columnDistribution);
        const tieKey = tieKeyFor(numbers);
        yield {
          variableNumbers,
          numbers,
          metadata,
          ...(tieKey ? { tieKey } : {}),
          rank: variableScore - repeatPenalty - parityPenalty - linePenalty - columnPenalty,
        };
      }
    };

    return topRankedCandidates(
      candidates(),
      24,
      (a, b) => b.rank - a.rank || (a.tieKey ?? a.numbers.join("-")).localeCompare(b.tieKey ?? b.numbers.join("-")),
    );
  });

  const portfolio = selectPortfolioCandidates(candidateGroups, generationMode, random, {
    overlapPenalty: policy.variableReusePenalty,
    beamWidth: 96,
    diversifiedPoolSize: 8,
  });
  if (portfolio.length !== gameCount) throw new Error("Unable to generate a Lotofacil portfolio with the requested constraints");

  return portfolio.map((winner) => ({
    lottery: "lotofacil",
    numbers: winner.numbers,
    fixedNumbers: [...fixedNumbers],
    variableNumbers: [...winner.variableNumbers].sort((a, b) => a - b),
    metadata: winner.metadata,
  }));
}
