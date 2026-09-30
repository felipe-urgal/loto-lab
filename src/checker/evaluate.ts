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
  return hits >= 3 && hits <= 6 ? `${hits}-acertos` : undefined;
}

export function evaluateGame(game: GeneratedGame, target: Contest): GameCheckResult {
  if (game.lottery !== target.lottery) {
    throw new Error(`Game lottery ${game.lottery} does not match target ${target.lottery}`);
  }

  const targetSet = new Set(target.numbers);
  const matchedNumbers = game.numbers.filter((number) => targetSet.has(number));
  const fixedMatchedNumbers = game.fixedNumbers.filter((number) => targetSet.has(number));
  const variableMatchedNumbers = game.variableNumbers.filter((number) => targetSet.has(number));
  const luckyMonthHit = game.lottery === "dia-de-sorte"
    ? canonical(game.luckyMonth) !== undefined && canonical(game.luckyMonth) === canonical(target.luckyMonth)
    : undefined;
  const currentQuote = quoteOfficialBet(game.lottery, game.numbers.length);
  const ticketCost = currentQuote
    ? currentQuote.pricePerBetCents / 100
    : trySimpleBetPriceForContest(target);
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
