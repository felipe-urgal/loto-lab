import type { Contest, ContestPrizeTier } from "../domain/types.js";

export interface ResolvedPrize {
  numberPrizeValue?: number;
  luckyMonthPrizeValue?: number;
  totalPrizeValue?: number;
}

function canonical(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function numericHitsFromTier(tier: ContestPrizeTier): number | undefined {
  const match = /(?:^|\s)(\d{1,2})\s*acertos?\b/i.exec(canonical(tier.description));
  return match ? Number(match[1]) : undefined;
}

function isLuckyMonthTier(tier: ContestPrizeTier): boolean {
  const description = canonical(tier.description);
  return description.includes("mes da sorte") || description.includes("mes de sorte");
}

function validPrizeValue(tier?: ContestPrizeTier): number | undefined {
  if (!tier || !Number.isFinite(tier.prizeValue) || tier.prizeValue < 0) return undefined;
  return tier.prizeValue;
}

export function prizeTierForHits(target: Contest, hits: number): ContestPrizeTier | undefined {
  return target.prizeTiers?.find((tier) => numericHitsFromTier(tier) === hits);
}

export function luckyMonthPrizeTier(target: Contest): ContestPrizeTier | undefined {
  if (target.lottery !== "dia-de-sorte") return undefined;
  return target.prizeTiers?.find(isLuckyMonthTier);
}

export function resolvePrizeValue(
  target: Contest,
  hits: number,
  luckyMonthHit = false,
): ResolvedPrize {
  const numberPrizeValue = validPrizeValue(prizeTierForHits(target, hits));
  const luckyMonthPrizeValue = luckyMonthHit
    ? validPrizeValue(luckyMonthPrizeTier(target))
    : undefined;

  if (numberPrizeValue === undefined && luckyMonthPrizeValue === undefined) {
    return {};
  }

  return {
    ...(numberPrizeValue !== undefined ? { numberPrizeValue } : {}),
    ...(luckyMonthPrizeValue !== undefined ? { luckyMonthPrizeValue } : {}),
    totalPrizeValue: (numberPrizeValue ?? 0) + (luckyMonthPrizeValue ?? 0),
  };
}
