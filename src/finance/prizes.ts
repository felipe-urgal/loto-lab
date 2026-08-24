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

function numberPrizeExpected(target: Contest, hits: number): boolean {
  if (target.lottery === "mega-sena") return hits >= 4;
  if (target.lottery === "lotofacil") return hits >= 11;
  return hits >= 4;
}

export function prizeTierForHits(target: Contest, hits: number): ContestPrizeTier | undefined {
  return target.prizeTiers?.find((tier) => numericHitsFromTier(tier) === hits);
}

export function luckyMonthPrizeTier(target: Contest): ContestPrizeTier | undefined {
  if (target.lottery !== "dia-de-sorte") return undefined;
  return target.prizeTiers?.find(isLuckyMonthTier);
}

export function hasCompletePrizeSchedule(target: Contest): boolean {
  const tiers = target.prizeTiers ?? [];
  if (target.lottery === "mega-sena") {
    return [4, 5, 6].every((hits) => tiers.some((tier) => numericHitsFromTier(tier) === hits));
  }
  if (target.lottery === "lotofacil") {
    return [11, 12, 13, 14, 15].every((hits) => tiers.some((tier) => numericHitsFromTier(tier) === hits));
  }
  return [4, 5, 6, 7].every((hits) => tiers.some((tier) => numericHitsFromTier(tier) === hits))
    && tiers.some(isLuckyMonthTier);
}

export function resolvePrizeValue(
  target: Contest,
  hits: number,
  luckyMonthHit = false,
): ResolvedPrize {
  const expectsNumberPrize = numberPrizeExpected(target, hits);
  const numberPrizeValue = expectsNumberPrize
    ? validPrizeValue(prizeTierForHits(target, hits))
    : 0;
  const numberPrizeKnown = !expectsNumberPrize || numberPrizeValue !== undefined;

  const expectsLuckyMonthPrize = target.lottery === "dia-de-sorte" && luckyMonthHit;
  const luckyMonthPrizeValue = expectsLuckyMonthPrize
    ? validPrizeValue(luckyMonthPrizeTier(target))
    : 0;
  const luckyMonthPrizeKnown = !expectsLuckyMonthPrize || luckyMonthPrizeValue !== undefined;

  const totalPrizeValue = numberPrizeKnown && luckyMonthPrizeKnown
    ? (numberPrizeValue ?? 0) + (luckyMonthPrizeValue ?? 0)
    : undefined;

  return {
    ...(numberPrizeValue !== undefined ? { numberPrizeValue } : {}),
    ...(target.lottery === "dia-de-sorte" && luckyMonthPrizeValue !== undefined ? { luckyMonthPrizeValue } : {}),
    ...(totalPrizeValue !== undefined ? { totalPrizeValue } : {}),
  };
}
