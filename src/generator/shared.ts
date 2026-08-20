import type { Contest, GeneratedGame, NumberAnalysis } from "../domain/types.js";

export function combinations<T>(items: T[], size: number): T[][] {
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

export function buildMetadata(
  numbers: number[],
  lastContest?: Contest,
  includeGrid = false,
): GeneratedGame["metadata"] {
  const odd = numbers.filter((number) => number % 2 !== 0).length;
  const repeatedFromLastContest = lastContest
    ? numbers.filter((number) => lastContest.numbers.includes(number))
    : [];

  const metadata: GeneratedGame["metadata"] = {
    odd,
    even: numbers.length - odd,
    sum: numbers.reduce((total, number) => total + number, 0),
    repeatedFromLastContest,
  };

  if (includeGrid) {
    metadata.lineDistribution = Array.from({ length: 5 }, (_, index) =>
      numbers.filter((number) => Math.floor((number - 1) / 5) === index).length,
    );
    metadata.columnDistribution = Array.from({ length: 5 }, (_, index) =>
      numbers.filter((number) => (number - 1) % 5 === index).length,
    );
  }

  return metadata;
}

export function scoreMap(analysis: NumberAnalysis[]): Map<number, number> {
  return new Map(analysis.map((row) => [row.number, row.score]));
}

export function selectProfiledFixedNumbers(
  analysis: NumberAnalysis[],
  count: number,
  lastContest?: Contest,
): number[] {
  if (!Number.isInteger(count) || count < 1 || count > analysis.length) {
    throw new Error("Invalid fixed-number count");
  }

  const selected = new Set<number>();

  function pick(value: (row: NumberAnalysis) => number): void {
    const candidate = [...analysis]
      .filter((row) => !selected.has(row.number))
      .sort((a, b) => value(b) - value(a) || b.score - a.score || a.number - b.number)[0];

    if (!candidate) throw new Error("Unable to select fixed number");
    selected.add(candidate.number);
  }

  pick((row) => row.year);
  if (selected.size < count) pick((row) => row.historical * 0.5 + row.year * 0.5);
  if (selected.size < count) pick((row) => row.recent10 * 0.6 + row.month * 0.4);

  while (selected.size < count) {
    pick((row) => {
      const repeatBonus = lastContest?.numbers.includes(row.number) ? 8 : 0;
      return row.score + repeatBonus;
    });
  }

  return [...selected].sort((a, b) => a - b);
}

export function gridExtremePenalty(distribution?: number[]): number {
  if (!distribution) return 0;
  return distribution.reduce((penalty, count) => {
    if (count === 0) return penalty + 8;
    if (count > 4) return penalty + (count - 4) * 15;
    return penalty;
  }, 0);
}
