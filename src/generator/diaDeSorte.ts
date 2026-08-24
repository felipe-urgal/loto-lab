import type { AnalysisModel, Contest, GeneratedGame } from "../domain/types.js";
import { buildNumberAnalysis } from "../analysis/scoring.js";
import { getLotteryConfig } from "../lotteries/config.js";
import { matchesGenerationConstraints, type GenerationConstraints } from "./planning.js";
import { selectPortfolioCandidates } from "./portfolio.js";
import {
  buildMetadata,
  buildStratifiedCandidatePool,
  combinationIterator,
  createStableNumberTieBreaker,
  GENERATION_POLICY,
  generationRandom,
  scoreMap,
  selectProfiledFixedNumbers,
  topRankedCandidates,
  type GenerationMode,
} from "./shared.js";

const config = getLotteryConfig("dia-de-sorte");

export type DiaDeSorteFixedCount = 0 | 2 | 3;

export interface DiaDeSorteGeneratorOptions {
  gameCount?: number;
  fixedCount?: DiaDeSorteFixedCount;
  generationMode?: GenerationMode;
  seed?: string;
  fixedNumbers?: number[];
  excludedNumbers?: number[];
  constraints?: GenerationConstraints;
  referenceContestNumber?: number | null;
  analysisModel?: AnalysisModel;
}

const LUCKY_MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

function canonicalLuckyMonth(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLocaleLowerCase("pt-BR");
  return LUCKY_MONTHS.find((month) => month.toLocaleLowerCase("pt-BR") === normalized);
}

export function rankLuckyMonths(contests: Contest[]): string[] {
  const scoped = contests.filter((contest) => contest.lottery === "dia-de-sorte").sort((a, b) => a.number - b.number);
  const referenceYear = scoped.at(-1)?.date.slice(0, 4);
  const historical = new Map<string, number>();
  const currentYear = new Map<string, number>();
  for (const contest of scoped) {
    const month = canonicalLuckyMonth(contest.luckyMonth);
    if (!month) continue;
    historical.set(month, (historical.get(month) ?? 0) + 1);
    if (referenceYear && contest.date.startsWith(referenceYear)) currentYear.set(month, (currentYear.get(month) ?? 0) + 1);
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
  fixedNumbers: number[];
  excludedNumbers: number[];
  constraints?: GenerationConstraints;
  referenceContestNumber?: number | null;
  analysisModel: AnalysisModel;
}

function normalizeOptions(value: number | DiaDeSorteGeneratorOptions): NormalizedDiaDeSorteGeneratorOptions {
  if (typeof value === "number") {
    return { gameCount: value, fixedCount: 3, generationMode: "deterministic", fixedNumbers: [], excludedNumbers: [], analysisModel: "score-v2" };
  }
  return {
    gameCount: value.gameCount ?? 2,
    fixedCount: value.fixedCount ?? 3,
    generationMode: value.generationMode ?? "deterministic",
    ...(value.seed !== undefined ? { seed: value.seed } : {}),
    fixedNumbers: value.fixedNumbers ?? [],
    excludedNumbers: value.excludedNumbers ?? [],
    ...(value.constraints !== undefined ? { constraints: value.constraints } : {}),
    ...(value.referenceContestNumber !== undefined ? { referenceContestNumber: value.referenceContestNumber } : {}),
    analysisModel: value.analysisModel ?? "score-v2",
  };
}

export function generateDiaDeSorteGames(contests: Contest[], options: number | DiaDeSorteGeneratorOptions = 2): GeneratedGame[] {
  const { gameCount, fixedCount, generationMode, seed, fixedNumbers: manualFixed, excludedNumbers, constraints, referenceContestNumber, analysisModel } = normalizeOptions(options);
  if (!Number.isInteger(gameCount) || gameCount < 1) throw new Error("gameCount must be a positive integer");
  if (![0, 2, 3].includes(fixedCount)) throw new Error("Dia de Sorte fixedCount must be 0, 2 or 3");
  if (manualFixed.length > fixedCount) throw new Error("Manual fixed numbers exceed the configured fixed core");

  const random = generationRandom(generationMode, seed);
  const scoped = contests.filter((contest) => contest.lottery === "dia-de-sorte").sort((a, b) => a.number - b.number);
  const lastContest = referenceContestNumber === undefined ? scoped.at(-1) : referenceContestNumber === null ? undefined : scoped.find((contest) => contest.number === referenceContestNumber);
  const analysis = buildNumberAnalysis(scoped, config, undefined, analysisModel);
  const tieBreaker = analysisModel === "no-score"
    ? createStableNumberTieBreaker(`no-score:dia-de-sorte:${scoped.at(-1)?.number ?? 0}`)
    : undefined;
  const neutralRank = tieBreaker
    ? new Map([...analysis].sort((a, b) => tieBreaker(a.number, b.number)).map((row, index) => [row.number, index]))
    : undefined;
  const tieKeyFor = (numbers: number[]) => neutralRank
    ? numbers.map((number) => neutralRank.get(number) ?? number).sort((a, b) => a - b).map((value) => String(value).padStart(3, "0")).join("-")
    : undefined;

  if (fixedCount === 0 && manualFixed.length > 0) throw new Error("Manual fixed numbers require a fixed core");
  const fixedNumbers = fixedCount === 0
    ? []
    : selectProfiledFixedNumbers(
      analysis,
      fixedCount,
      lastContest,
      Math.min(1, fixedCount),
      random,
      manualFixed,
      excludedNumbers,
      tieBreaker,
    );
  const fixedSet = new Set(fixedNumbers);
  const excludedSet = new Set(excludedNumbers);
  const scores = scoreMap(analysis);
  const variableCount = config.drawSize - fixedCount;
  const poolSize = fixedCount === 0 ? 13 : fixedCount === 2 ? 14 : 18;
  const candidatePool = buildStratifiedCandidatePool(analysis, fixedSet, excludedSet, poolSize, tieBreaker);
  const repeatTargets = [1, 2, 1, 2];
  const oddTargets = [3, 4, 3, 4];
  const luckyMonths = rankLuckyMonths(scoped);
  const policy = GENERATION_POLICY.diaDeSorte;

  const candidateGroups = Array.from({ length: gameCount }, (_, gameIndex) => {
    const targetRepeat = lastContest ? repeatTargets[gameIndex % repeatTargets.length]! : 0;
    const targetOdd = oddTargets[gameIndex % oddTargets.length]!;
    const luckyMonth = luckyMonths[gameIndex % luckyMonths.length];
    const candidates = function* () {
      for (const variableNumbers of combinationIterator(candidatePool, variableCount)) {
        const numbers = [...fixedNumbers, ...variableNumbers].sort((a, b) => a - b);
        const metadata = buildMetadata(numbers, lastContest);
        const game: GeneratedGame = { lottery: "dia-de-sorte", numbers, fixedNumbers, variableNumbers, ...(luckyMonth ? { luckyMonth } : {}), metadata };
        if (!matchesGenerationConstraints(game, constraints)) continue;
        const variableScore = variableNumbers.reduce((total, number) => total + (scores.get(number) ?? 0), 0);
        const repeatPenalty = Math.abs(metadata.repeatedFromLastContest.length - targetRepeat) * policy.repeatDistancePenalty;
        const parityPenalty = Math.abs(metadata.odd - targetOdd) * policy.parityDistancePenalty;
        const sumPenalty = Math.abs(metadata.sum - 112) * policy.sumDistancePenalty;
        const tieKey = tieKeyFor(numbers);
        yield {
          variableNumbers,
          numbers,
          metadata,
          ...(luckyMonth ? { luckyMonth } : {}),
          ...(tieKey ? { tieKey } : {}),
          rank: variableScore - repeatPenalty - parityPenalty - sumPenalty,
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
  if (portfolio.length !== gameCount) throw new Error("Unable to generate a Dia de Sorte portfolio with the requested constraints");

  return portfolio.map((winner, index) => ({
    lottery: "dia-de-sorte",
    numbers: winner.numbers,
    fixedNumbers: [...fixedNumbers],
    variableNumbers: [...winner.variableNumbers].sort((a, b) => a - b),
    luckyMonth: (winner as typeof winner & { luckyMonth?: string }).luckyMonth ?? luckyMonths[index % luckyMonths.length],
    metadata: winner.metadata,
  }));
}
