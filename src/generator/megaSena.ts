import type { Contest, GeneratedGame, NumberAnalysis } from "../domain/types.js";
import { getLotteryConfig } from "../lotteries/config.js";
import { buildNumberAnalysis } from "../analysis/scoring.js";

const config = getLotteryConfig("mega-sena");

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

export function selectMegaSenaFixedNumbers(analysis: NumberAnalysis[]): number[] {
  const selected = new Set<number>();

  const annual = bestUnused(analysis, selected, (row) => row.year);
  const historicalAndAnnual = bestUnused(
    analysis,
    selected,
    (row) => row.historical * 0.5 + row.year * 0.5,
  );
  const recent = bestUnused(
    analysis,
    selected,
    (row) => row.recent10 * 0.6 + row.month * 0.4,
  );

  return [annual, historicalAndAnnual, recent].sort((a, b) => a - b);
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

export function generateMegaSenaGames(contests: Contest[], gameCount = 2): GeneratedGame[] {
  if (!Number.isInteger(gameCount) || gameCount < 1) {
    throw new Error("gameCount must be a positive integer");
  }

  const scoped = contests
    .filter((contest) => contest.lottery === "mega-sena")
    .sort((a, b) => a.number - b.number);
  const analysis = buildNumberAnalysis(scoped, config);
  const fixedNumbers = selectMegaSenaFixedNumbers(analysis);
  const fixedSet = new Set(fixedNumbers);
  const lastContest = scoped.at(-1);
  const scoreByNumber = new Map(analysis.map((row) => [row.number, row.score]));
  const candidatePool = [...analysis]
    .filter((row) => !fixedSet.has(row.number))
    .sort((a, b) => b.score - a.score || a.number - b.number)
    .slice(0, 24)
    .map((row) => row.number);

  const usedVariables = new Set<number>();
  const parityTargets = [3, 4, 2];
  const games: GeneratedGame[] = [];

  for (let gameIndex = 0; gameIndex < gameCount; gameIndex += 1) {
    const targetOdd = parityTargets[gameIndex % parityTargets.length]!;
    const options = combinations(candidatePool, 3);

    const ranked = options
      .map((variableNumbers) => {
        const numbers = [...fixedNumbers, ...variableNumbers].sort((a, b) => a - b);
        const metadata = buildMetadata(numbers, lastContest);
        const baseScore = variableNumbers.reduce(
          (total, number) => total + (scoreByNumber.get(number) ?? 0),
          0,
        );
        const reused = variableNumbers.filter((number) => usedVariables.has(number)).length;
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
      .sort((a, b) => b.rank - a.rank || a.numbers.join("-").localeCompare(b.numbers.join("-")));

    const winner = ranked[0];
    if (!winner) throw new Error("Unable to generate a Mega-Sena game");

    winner.variableNumbers.forEach((number) => usedVariables.add(number));
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
