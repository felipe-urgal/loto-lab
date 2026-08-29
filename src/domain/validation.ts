import type { GeneratedGame, LotteryId } from "./types.js";
import { getLotteryConfig } from "../lotteries/config.js";

const FIXED_COUNTS: Record<LotteryId, readonly number[]> = {
  "mega-sena": [0, 2, 3],
  lotofacil: [8, 9, 10],
  "dia-de-sorte": [0, 2, 3],
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
  if (new Set(numbers).size !== numbers.length) {
    throw new Error(`Duplicated drawn number returned by Caixa for ${lottery}`);
  }
}

export function assertValidGeneratedGame(game: GeneratedGame): void {
  const config = getLotteryConfig(game.lottery);
  if (game.numbers.length !== config.drawSize) {
    throw new Error(`${game.lottery} games must contain exactly ${config.drawSize} numbers`);
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

  if (game.lottery === "dia-de-sorte") {
    if (!game.luckyMonth || !LUCKY_MONTHS.has(game.luckyMonth)) {
      throw new Error("Dia de Sorte games require a valid Mês da Sorte");
    }
  } else if (game.luckyMonth !== undefined) {
    throw new Error(`${game.lottery} games cannot contain a Mês da Sorte`);
  }
}
