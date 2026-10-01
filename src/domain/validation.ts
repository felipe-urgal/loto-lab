import type { GeneratedGame, LotteryId } from "./types.js";
import { getLotteryConfig } from "../lotteries/config.js";
import { getOfficialBetRule } from "./betRules.js";

const FIXED_COUNTS: Record<LotteryId, readonly number[]> = {
  "mega-sena": [0, 2, 3],
  lotofacil: [8, 9, 10],
  "dia-de-sorte": [0, 2, 3],
  quina: [0],
  lotomania: [0],
  "dupla-sena": [0],
  "mais-milionaria": [0],
  timemania: [0],
  "super-sete": [0],
};

const LUCKY_MONTHS = new Set([
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]);

function hasUniqueIntegers(values: number[]): boolean {
  return values.every(Number.isInteger) && new Set(values).size === values.length;
}

function sameMembers(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

export function assertValidContestNumbers(lottery: LotteryId, numbers: number[]): void {
  const config = getLotteryConfig(lottery);
  if (numbers.length !== config.drawSize) {
    throw new Error(`Expected ${config.drawSize} numbers for ${lottery}, received ${numbers.length}`);
  }
  if (numbers.some((number) => !Number.isInteger(number) || number < config.minNumber || number > config.maxNumber)) {
    throw new Error(`Invalid drawn number returned by Caixa for ${lottery}`);
  }
  if (lottery !== "super-sete" && new Set(numbers).size !== numbers.length) {
    throw new Error(`Duplicated drawn number returned by Caixa for ${lottery}`);
  }
}

export function assertValidGeneratedGame(game: GeneratedGame): void {
  const config = getLotteryConfig(game.lottery);
  if (game.lottery === "super-sete") {
    const totalMarks = game.columns?.reduce((sum, column) => sum + column.length, 0) ?? 0;
    if (
      !game.columns
      || game.columns.length !== 7
      || game.columns.some((column) =>
        column.length < 1
        || column.length > 3
        || !hasUniqueIntegers(column)
        || column.some((value) => value < 0 || value > 9)
      )
      || totalMarks < 7
      || totalMarks > 21
      || (totalMarks <= 14 && game.columns.some((column) => column.length > 2))
      || (totalMarks >= 15 && game.columns.some((column) => column.length < 2))
    ) {
      throw new Error("Super Sete games require a valid 7-column composition with 7 to 21 marks");
    }
    if (game.numbers.length !== 0 || game.fixedNumbers.length !== 0 || game.variableNumbers.length !== 0) {
      throw new Error("Super Sete columns must not be flattened into number selections");
    }
    return;
  }
  const officialRule = getOfficialBetRule(game.lottery);
  const minBetSize = game.lottery === "mais-milionaria"
    ? 6
    : officialRule?.minBetSize ?? config.defaultBetSize;
  const maxBetSize = game.lottery === "mais-milionaria"
    ? 12
    : officialRule?.maxBetSize ?? config.defaultBetSize;
  if (game.numbers.length < minBetSize || game.numbers.length > maxBetSize) {
    throw new Error(
      `${game.lottery} games must contain between ${minBetSize} and ${maxBetSize} numbers`,
    );
  }

  if (
    !hasUniqueIntegers(game.numbers)
    || !hasUniqueIntegers(game.fixedNumbers)
    || !hasUniqueIntegers(game.variableNumbers)
    || new Set([...game.fixedNumbers, ...game.variableNumbers]).size
      !== game.fixedNumbers.length + game.variableNumbers.length
  ) {
    throw new Error("Game numbers and partitions must be unique integers");
  }

  if (
    game.numbers.length !== game.fixedNumbers.length + game.variableNumbers.length
    || !sameMembers(game.numbers, [...game.fixedNumbers, ...game.variableNumbers])
  ) {
    throw new Error("Fixed and variable numbers must partition the game");
  }

  if (game.numbers.some((number) => number < config.minNumber || number > config.maxNumber)) {
    throw new Error(`${game.lottery} numbers must be between ${config.minNumber} and ${config.maxNumber}`);
  }

  if (!FIXED_COUNTS[game.lottery].includes(game.fixedNumbers.length)) {
    throw new Error(`${game.lottery} fixed count ${game.fixedNumbers.length} is not supported`);
  }

  if (game.lottery === "mais-milionaria") {
    if (
      game.secondary?.kind !== "clovers"
      || game.secondary.values.length < 2
      || game.secondary.values.length > 6
      || !hasUniqueIntegers(game.secondary.values)
      || game.secondary.values.some((value) => value < 1 || value > 6)
    ) {
      throw new Error("+Milionária games require 2 to 6 unique trevos between 1 and 6");
    }
  } else if (game.lottery === "timemania") {
    if (
      game.secondary?.kind !== "favorite-team"
      || game.secondary.values.length !== 1
      || !game.secondary.values[0]?.trim()
    ) {
      throw new Error("Timemania games require exactly one Time do Coração");
    }
  } else if (game.lottery === "dia-de-sorte") {
    const month = game.secondary?.kind === "lucky-month"
      ? game.secondary.values[0]
      : game.luckyMonth;
    if (!month || !LUCKY_MONTHS.has(month)) {
      throw new Error("Dia de Sorte games require a valid Mês da Sorte");
    }
    if (game.secondary !== undefined && (game.secondary.kind !== "lucky-month" || game.secondary.values.length !== 1)) {
      throw new Error("Dia de Sorte secondary selection must contain exactly one Mês da Sorte");
    }
  } else if (game.secondary !== undefined) {
    throw new Error(`${game.lottery} games cannot contain secondary selections`);
  }

  if (game.lottery !== "dia-de-sorte" && game.luckyMonth !== undefined) {
    throw new Error(`${game.lottery} games cannot contain a Mês da Sorte`);
  }

  if (game.lottery === "lotomania") {
    const universe = Array.from({ length: 100 }, (_, index) => index);
    const expectedMirror = universe.filter((number) => !game.numbers.includes(number));
    if (game.mirrorNumbers === undefined || !sameMembers(game.mirrorNumbers, expectedMirror)) {
      throw new Error("Lotomania games require an explicit 50-number mirror");
    }
  } else if (game.mirrorNumbers !== undefined) {
    throw new Error(`${game.lottery} games cannot contain Lotomania mirror numbers`);
  }
}
