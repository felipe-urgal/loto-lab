import type { Contest, ContestPrizeTier } from "../domain/types.js";

export interface ResolvedPrize {
  numberPrizeValue?: number;
  luckyMonthPrizeValue?: number;
  secondaryPrizeValue?: number;
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

/** Only unambiguous official descriptions are mapped to their structured tier. */
export function structuredTierIndex(description: string): number | undefined {
  const d = canonical(description).replace(/\\s+/g, " ");
  const explicit = /^(?:faixa|premio|premiacao)\\s*(?:n[º°.]?\\s*)?(10|[1-9])(?:\\s*[ªa])?$/.exec(d);
  if (explicit) return Number(explicit[1]);
  const match = /^(\\d)\\s*(?:acertos?|numeros?|dezenas?)\\s*(?:\\+|e)\\s*(\\d)\\s*trevos?$/.exec(d);
  if (!match) return undefined;
  const hits = Number(match[1]), clovers = Number(match[2]);
  if (hits === 6) return clovers === 2 ? 1 : clovers <= 1 ? 2 : undefined;
  if (hits === 5) return clovers === 2 ? 3 : clovers <= 1 ? 4 : undefined;
  if (hits === 4) return clovers === 2 ? 5 : clovers <= 1 ? 6 : undefined;
  if (hits === 3) return clovers === 2 ? 7 : clovers === 1 ? 8 : undefined;
  if (hits === 2) return clovers === 2 ? 9 : clovers === 1 ? 10 : undefined;
  return undefined;
}

function structuredTier(target: Contest, index: number): ContestPrizeTier | undefined {
  const matching = (target.prizeTiers ?? []).filter(t => structuredTierIndex(t.description) === index);
  return matching.length === 1 ? matching[0] : undefined;
}

function teamTier(tier: ContestPrizeTier): boolean {
  return /^(?:time do coracao|time de coracao)(?:\\s*[-:]\\s*.*)?$/.test(canonical(tier.description));
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
  if (target.lottery === "mais-milionaria") return Array.from({ length: 10 }, (_, i) => i + 1).every(i => validPrizeValue(structuredTier(target, i)) !== undefined);
  if (target.lottery === "timemania") return [3, 4, 5, 6, 7].every(h => validPrizeValue(prizeTierForHits(target, h)) !== undefined) && tiers.filter(teamTier).length === 1 && validPrizeValue(tiers.find(teamTier)) !== undefined;
  if (target.lottery === "super-sete") {
    return [3, 4, 5, 6, 7].every(
      (hits) => validPrizeValue(prizeTierForHits(target, hits)) !== undefined,
    );
  }
  return false;
}

export function resolvePrizeValue(
  target: Contest,
  hits: number,
  luckyMonthHit = false,
  draw: 1 | 2 = 1,
  structured?: { cloverHits?: number; favoriteTeamHit?: boolean },
): ResolvedPrize {
  const index = target.lottery === "mais-milionaria" && structured?.cloverHits !== undefined ? (hits === 6 ? (structured.cloverHits === 2 ? 1 : 2) : hits === 5 ? (structured.cloverHits === 2 ? 3 : 4) : hits === 4 ? (structured.cloverHits === 2 ? 5 : 6) : hits === 3 ? (structured.cloverHits === 2 ? 7 : structured.cloverHits === 1 ? 8 : undefined) : hits === 2 ? (structured.cloverHits === 2 ? 9 : structured.cloverHits === 1 ? 10 : undefined) : undefined) : undefined;
  const expectsNumberPrize = index !== undefined || numberPrizeExpected(target, hits);
  const missingStructuredData = target.lottery === "mais-milionaria" && structured?.cloverHits === undefined && hits >= 2;
  const secondaryExpected = target.lottery === "timemania" && structured?.favoriteTeamHit === true;
  const secondaryTiers = target.prizeTiers?.filter(teamTier) ?? [];
  const secondaryPrizeValue = secondaryExpected && secondaryTiers.length === 1 ? validPrizeValue(secondaryTiers[0]) : secondaryExpected ? undefined : 0;
  const numberPrizeValue = expectsNumberPrize
    ? validPrizeValue(index !== undefined ? structuredTier(target, index) : prizeTierForHits(target, hits, draw))
    : 0;
  const numberPrizeKnown = !expectsNumberPrize || numberPrizeValue !== undefined;

  const expectsLuckyMonthPrize = target.lottery === "dia-de-sorte" && luckyMonthHit;
  const luckyMonthPrizeValue = expectsLuckyMonthPrize
    ? validPrizeValue(luckyMonthPrizeTier(target))
    : 0;
  const luckyMonthPrizeKnown = !expectsLuckyMonthPrize || luckyMonthPrizeValue !== undefined;

  const totalPrizeValue = numberPrizeKnown && luckyMonthPrizeKnown && !missingStructuredData && secondaryPrizeValue !== undefined
    ? (numberPrizeValue ?? 0) + (luckyMonthPrizeValue ?? 0) + secondaryPrizeValue
    : undefined;

  return {
    ...(numberPrizeValue !== undefined ? { numberPrizeValue } : {}),
    ...(target.lottery === "dia-de-sorte" && luckyMonthPrizeValue !== undefined ? { luckyMonthPrizeValue } : {}),
    ...(secondaryExpected && secondaryPrizeValue !== undefined ? { secondaryPrizeValue } : {}),
    ...(totalPrizeValue !== undefined ? { totalPrizeValue } : {}),
  };
}
