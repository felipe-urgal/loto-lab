export const GUILHERMINO_HIGH_FREQUENCY_GROUP = [
  4, 5, 7, 12, 13, 16, 17, 23, 24, 29, 30, 32, 33,
  37, 38, 41, 42, 43, 47, 49, 50, 51, 53, 54, 58, 59,
] as const;

const GUILHERMINO_GROUP_SET = new Set<number>(GUILHERMINO_HIGH_FREQUENCY_GROUP);

export interface MegaSenaGameRules {
  minPreferredGroup?: 2 | 3;
  avoidConsecutive?: boolean;
  avoidSameColumn?: boolean;
  equalParity?: boolean;
  minQuadrants?: 3 | 4;
}

export function megaSenaColumn(number: number): number {
  return (number - 1) % 10;
}

export function megaSenaQuadrant(number: number): 1 | 2 | 3 | 4 {
  const zeroBased = number - 1;
  const row = Math.floor(zeroBased / 10);
  const column = zeroBased % 10;
  const top = row < 3;
  const left = column < 5;
  if (top && left) return 1;
  if (top && !left) return 2;
  if (!top && left) return 3;
  return 4;
}

export function countPreferredGroup(numbers: number[]): number {
  return numbers.filter((number) => GUILHERMINO_GROUP_SET.has(number)).length;
}

export function hasConsecutiveNumbers(numbers: number[]): boolean {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted.some((number, index) => index > 0 && number - sorted[index - 1]! === 1);
}

export function hasRepeatedColumn(numbers: number[]): boolean {
  const columns = numbers.map(megaSenaColumn);
  return new Set(columns).size !== columns.length;
}

export function representedQuadrants(numbers: number[]): number {
  return new Set(numbers.map(megaSenaQuadrant)).size;
}

export function matchesMegaSenaRules(numbers: number[], rules: MegaSenaGameRules = {}): boolean {
  if (rules.minPreferredGroup !== undefined && countPreferredGroup(numbers) < rules.minPreferredGroup) {
    return false;
  }
  if (rules.avoidConsecutive && hasConsecutiveNumbers(numbers)) return false;
  if (rules.avoidSameColumn && hasRepeatedColumn(numbers)) return false;
  if (rules.equalParity) {
    const odd = numbers.filter((number) => number % 2 !== 0).length;
    if (odd !== 3) return false;
  }
  if (rules.minQuadrants !== undefined && representedQuadrants(numbers) < rules.minQuadrants) {
    return false;
  }
  return true;
}

export const ARTICLE_RULES_GROUP_2: MegaSenaGameRules = {
  minPreferredGroup: 2,
  avoidConsecutive: true,
  avoidSameColumn: true,
  equalParity: true,
  minQuadrants: 4,
};

export const ARTICLE_RULES_GROUP_3: MegaSenaGameRules = {
  ...ARTICLE_RULES_GROUP_2,
  minPreferredGroup: 3,
};
