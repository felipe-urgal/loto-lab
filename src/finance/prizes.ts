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
  if (target.lottery === "dia-de-sorte") return hits >= 4;
  if (target.lottery === "quina") return hits >= 2;
  if (target.lottery === "lotomania") return hits === 0 || (hits >= 15 && hits <= 20);
  if (target.lottery === "dupla-sena") return hits >= 3;
  if (target.lottery === "timemania" || target.lottery === "super-sete") return hits >= 3;
  return false;
}

export function prizeTierForHits(
  target: Contest,
  hits: number,
  draw: 1 | 2 = 1,
): ContestPrizeTier | undefined {
  return target.prizeTiers?.find(
    (tier) => numericHitsFromTier(tier) === hits && (tier.draw ?? 1) === draw,
  );
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
  if (target.lottery === "dia-de-sorte") {
    return [4, 5, 6, 7].every((hits) => tiers.some((tier) => numericHitsFromTier(tier) === hits))
      && tiers.some(isLuckyMonthTier);
  }
  if (target.lottery === "quina") {
    return [2, 3, 4, 5].every((hits) => tiers.some((tier) => numericHitsFromTier(tier) === hits));
  }
  if (target.lottery === "lotomania") {
    return [0, 15, 16, 17, 18, 19, 20].every(
      (hits) => tiers.some((tier) => numericHitsFromTier(tier) === hits),
    );
  }
  if (target.lottery === "dupla-sena") {
    return [1, 2].every((draw) =>
      [3, 4, 5, 6].every((hits) =>
        tiers.some((tier) => numericHitsFromTier(tier) === hits && (tier.draw ?? 1) === draw),
      ),
    );
  }
  if (target.lottery === "timemania" || target.lottery === "super-sete") {
    return [3, 4, 5, 6, 7].every(
      (hits) => tiers.some((tier) => numericHitsFromTier(tier) === hits),
    );
  }
  return false;
}

export function resolvePrizeValue(
  target: Contest,
  hits: number,
  luckyMonthHit = false,
  draw: 1 | 2 = 1,
): ResolvedPrize {
  const expectsNumberPrize = numberPrizeExpected(target, hits);
  const numberPrizeValue = expectsNumberPrize
    ? validPrizeValue(prizeTierForHits(target, hits, draw))
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
