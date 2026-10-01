import type { Contest, GeneratedGame, LotteryId } from "../domain/types.js";
import { quoteOfficialBet } from "../domain/betRules.js";
import { trySimpleBetPriceForContest } from "../finance/pricing.js";
import { resolvePrizeValue } from "../finance/prizes.js";

export interface GameCheckResult {
  lottery: LotteryId;
  contest: number;
  hits: number;
  matchedNumbers: number[];
  fixedHits: number;
  fixedMatchedNumbers: number[];
  variableHits: number;
  variableMatchedNumbers: number[];
  prizeTier?: string;
  luckyMonthHit?: boolean;
  ticketCost?: number;
  numberPrizeValue?: number;
  luckyMonthPrizeValue?: number;
  totalPrizeValue?: number;
  netResult?: number;
  secondDrawHits?: number;
  secondDrawMatchedNumbers?: number[];
  secondDrawPrizeTier?: string;
  secondDrawPrizeValue?: number;
  secondaryHits?: number;
  secondaryHit?: boolean;
  matchedColumns?: number[];
}

function canonical(value?: string): string | undefined {
  return value?.trim().toLocaleLowerCase("pt-BR") || undefined;
}

export function prizeTierFor(lottery: LotteryId, hits: number): string | undefined {
  if (lottery === "mega-sena") {
    if (hits === 6) return "sena";
    if (hits === 5) return "quina";
    if (hits === 4) return "quadra";
    return undefined;
  }

  if (lottery === "lotofacil") {
    return hits >= 11 && hits <= 15 ? `${hits}-acertos` : undefined;
  }
  if (lottery === "dia-de-sorte") {
    return hits >= 4 && hits <= 7 ? `${hits}-acertos` : undefined;
  }
  if (lottery === "quina") {
    return hits >= 2 && hits <= 5 ? `${hits}-acertos` : undefined;
  }
  if (lottery === "lotomania") {
    return hits === 0 || (hits >= 15 && hits <= 20) ? `${hits}-acertos` : undefined;
  }
  if (lottery === "dupla-sena") return hits >= 3 && hits <= 6 ? `${hits}-acertos` : undefined;
  if (lottery === "timemania") return hits >= 3 && hits <= 7 ? `${hits}-acertos` : undefined;
  if (lottery === "super-sete") return hits >= 3 && hits <= 7 ? `${hits}-acertos` : undefined;
  return undefined;
}

export function evaluateGame(game: GeneratedGame, target: Contest): GameCheckResult {
  if (game.lottery !== target.lottery) {
    throw new Error(`Game lottery ${game.lottery} does not match target ${target.lottery}`);
  }

  if (game.lottery === "super-sete") {
    const gameColumns = game.columns ?? [];
    const targetColumns = target.columns ?? target.numbers;
    if (gameColumns.length !== 7 || targetColumns.length !== 7) {
      throw new Error("Super Sete checking requires seven ordered columns");
    }
    const matchedColumns = gameColumns
      .map((values, index) => values.includes(targetColumns[index]!) ? index + 1 : undefined)
      .filter((value): value is number => value !== undefined);
    return {
      lottery: game.lottery,
      contest: target.number,
      hits: matchedColumns.length,
      matchedNumbers: [],
      fixedHits: 0,
      fixedMatchedNumbers: [],
      variableHits: 0,
      variableMatchedNumbers: [],
      matchedColumns,
      prizeTier: prizeTierFor(game.lottery, matchedColumns.length),
    };
  }

  const targetSet = new Set(target.numbers);
  const matchedNumbers = game.numbers.filter((number) => targetSet.has(number));
  const fixedMatchedNumbers = game.fixedNumbers.filter((number) => targetSet.has(number));
  const variableMatchedNumbers = game.variableNumbers.filter((number) => targetSet.has(number));
  const luckyMonthHit = game.lottery === "dia-de-sorte"
    ? canonical(game.luckyMonth) !== undefined && canonical(game.luckyMonth) === canonical(target.luckyMonth)
    : undefined;
  const gameClovers = game.secondary?.kind === "clovers" ? game.secondary.values : undefined;
  const targetClovers = target.secondary?.kind === "clovers" ? target.secondary.values : undefined;
  const secondaryHits = game.lottery === "mais-milionaria" && gameClovers && targetClovers
    ? gameClovers.filter((value) => targetClovers.includes(value)).length
    : undefined;
  const secondaryHit = game.lottery === "timemania"
    && game.secondary?.kind === "favorite-team"
    && target.secondary?.kind === "favorite-team"
    ? canonical(game.secondary.values[0]) === canonical(target.secondary.values[0])
    : undefined;
  const currentQuote = quoteOfficialBet(game.lottery, game.numbers.length);
  const historicalSimplePrice = trySimpleBetPriceForContest(target);
  const ticketCost = historicalSimplePrice !== undefined
    ? historicalSimplePrice * (currentQuote?.simpleEquivalentCount ?? 1)
    : undefined;
  const prize = resolvePrizeValue(target, matchedNumbers.length, luckyMonthHit ?? false, 1);
  const secondDrawMatchedNumbers = target.secondDrawNumbers
    ? game.numbers.filter((number) => target.secondDrawNumbers!.includes(number))
    : undefined;
  const secondDrawPrize = target.lottery === "dupla-sena" && secondDrawMatchedNumbers
    ? resolvePrizeValue(target, secondDrawMatchedNumbers.length, false, 2)
    : undefined;
  const combinedPrizeValue = prize.totalPrizeValue !== undefined
    && (secondDrawPrize === undefined || secondDrawPrize.totalPrizeValue !== undefined)
    ? prize.totalPrizeValue + (secondDrawPrize?.totalPrizeValue ?? 0)
    : undefined;
  const netResult = combinedPrizeValue !== undefined && ticketCost !== undefined
    ? combinedPrizeValue - ticketCost
    : undefined;

  return {
    lottery: game.lottery,
    contest: target.number,
    hits: matchedNumbers.length,
    matchedNumbers,
    fixedHits: fixedMatchedNumbers.length,
    fixedMatchedNumbers,
    variableHits: variableMatchedNumbers.length,
    variableMatchedNumbers,
    prizeTier: prizeTierFor(game.lottery, matchedNumbers.length),
    ...(luckyMonthHit !== undefined ? { luckyMonthHit } : {}),
    ...(secondaryHits !== undefined ? { secondaryHits } : {}),
    ...(secondaryHit !== undefined ? { secondaryHit } : {}),
    ...(ticketCost !== undefined ? { ticketCost } : {}),
    ...prize,
    ...(secondDrawMatchedNumbers
      ? {
          secondDrawHits: secondDrawMatchedNumbers.length,
          secondDrawMatchedNumbers,
          secondDrawPrizeTier: prizeTierFor(game.lottery, secondDrawMatchedNumbers.length),
          ...(secondDrawPrize?.totalPrizeValue !== undefined
            ? { secondDrawPrizeValue: secondDrawPrize.totalPrizeValue }
            : {}),
        }
      : {}),
    ...(combinedPrizeValue !== undefined ? { totalPrizeValue: combinedPrizeValue } : {}),
    ...(netResult !== undefined ? { netResult } : {}),
  };
}

export function evaluateGames(games: GeneratedGame[], target: Contest): GameCheckResult[] {
  if (games.length === 0) return [];
  return games.map((game) => evaluateGame(game, target));
}
