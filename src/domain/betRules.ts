import type { LotteryProductId } from "./lotteryCatalog.js";

export interface OfficialBetRuleSnapshot {
  product: LotteryProductId;
  version: string;
  effectiveFrom: string;
  verifiedAt: string;
  sourceUrl: string;
  universeSize: number;
  drawSize: number;
  minBetSize: number;
  maxBetSize: number;
  simplePriceCents: number;
  topPrizeOneInByBetSize: Readonly<Record<number, number>>;
}

export interface BetQuote {
  product: LotteryProductId;
  betSize: number;
  gameCount: number;
  simpleEquivalentCount: number;
  pricePerBetCents: number;
  totalPriceCents: number;
  topPrizeOneIn: number;
  rule: {
    version: string;
    effectiveFrom: string;
    verifiedAt: string;
    sourceUrl: string;
  };
}

export class BetSizeOutOfRangeError extends Error {
  readonly code = "BET_SIZE_OUT_OF_RANGE";

  constructor(
    readonly product: LotteryProductId,
    readonly betSize: number,
    readonly minBetSize: number,
    readonly maxBetSize: number,
  ) {
    super(
      `${product} betSize must be between ${minBetSize} and ${maxBetSize}; received ${betSize}`,
    );
    this.name = "BetSizeOutOfRangeError";
  }
}

export function combinationCount(n: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) return 0;
  const size = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= size; index += 1) {
    result = (result * (n - size + index)) / index;
  }
  return Math.round(result);
}

export function simpleEquivalentCount(betSize: number, simpleSize: number): number {
  return combinationCount(betSize, simpleSize);
}

const VERIFIED_AT = "2026-09-30";
const EFFECTIVE_FROM = "2026-09-30";

export const OFFICIAL_BET_RULES = {
  "mega-sena": {
    product: "mega-sena",
    version: "caixa-2026-09-30",
    effectiveFrom: EFFECTIVE_FROM,
    verifiedAt: VERIFIED_AT,
    sourceUrl: "https://loterias.caixa.gov.br/Paginas/mega-sena.aspx",
    universeSize: 60,
    drawSize: 6,
    minBetSize: 6,
    maxBetSize: 20,
    simplePriceCents: 600,
    topPrizeOneInByBetSize: {
      6: 50063860,
      7: 7151980,
      8: 1787995,
      9: 595998,
      10: 238399,
      11: 108363,
      12: 54182,
      13: 29175,
      14: 16671,
      15: 10003,
      16: 6252,
      17: 4045,
      18: 2697,
      19: 1845,
      20: 1292,
    },
  },
  lotofacil: {
    product: "lotofacil",
    version: "caixa-2026-09-30",
    effectiveFrom: EFFECTIVE_FROM,
    verifiedAt: VERIFIED_AT,
    sourceUrl: "https://loterias.caixa.gov.br/Paginas/lotofacil.aspx",
    universeSize: 25,
    drawSize: 15,
    minBetSize: 15,
    maxBetSize: 20,
    simplePriceCents: 350,
    topPrizeOneInByBetSize: {
      15: 3268760,
      16: 204298,
      17: 24035,
      18: 4006,
      19: 843,
      20: 211,
    },
  },
  quina: {
    product: "quina",
    version: "caixa-2026-09-30",
    effectiveFrom: EFFECTIVE_FROM,
    verifiedAt: VERIFIED_AT,
    sourceUrl: "https://loterias.caixa.gov.br/Paginas/quina.aspx",
    universeSize: 80,
    drawSize: 5,
    minBetSize: 5,
    maxBetSize: 15,
    simplePriceCents: 300,
    topPrizeOneInByBetSize: {
      5: 24040016,
      6: 4006669,
      7: 1144763,
      8: 429286,
      9: 190794,
      10: 95396,
      11: 52035,
      12: 30354,
      13: 18679,
      14: 12008,
      15: 8005,
    },
  },
  "dupla-sena": {
    product: "dupla-sena",
    version: "caixa-2026-09-30",
    effectiveFrom: EFFECTIVE_FROM,
    verifiedAt: VERIFIED_AT,
    sourceUrl: "https://loterias.caixa.gov.br/Paginas/dupla-sena.aspx",
    universeSize: 50,
    drawSize: 6,
    minBetSize: 6,
    maxBetSize: 15,
    simplePriceCents: 300,
    topPrizeOneInByBetSize: {
      6: 15890700,
      7: 2270100,
      8: 567525,
      9: 189175,
      10: 75670,
      11: 34395,
      12: 17197,
      13: 9260,
      14: 5291,
      15: 3174,
    },
  },
} as const satisfies Partial<Record<LotteryProductId, OfficialBetRuleSnapshot>>;

export function getOfficialBetRule(
  product: LotteryProductId,
): OfficialBetRuleSnapshot | undefined {
  return (OFFICIAL_BET_RULES as Partial<Record<LotteryProductId, OfficialBetRuleSnapshot>>)[product];
}

export function quoteOfficialBet(
  product: LotteryProductId,
  betSize: number,
  gameCount = 1,
): BetQuote | undefined {
  const rule = getOfficialBetRule(product);
  if (!rule) return undefined;
  if (
    !Number.isInteger(betSize)
    || betSize < rule.minBetSize
    || betSize > rule.maxBetSize
  ) {
    throw new BetSizeOutOfRangeError(
      product,
      betSize,
      rule.minBetSize,
      rule.maxBetSize,
    );
  }
  if (!Number.isInteger(gameCount) || gameCount < 1) {
    throw new Error("gameCount must be a positive integer");
  }

  const simpleEquivalentCountValue = simpleEquivalentCount(betSize, rule.drawSize);
  const topPrizeOneIn = rule.topPrizeOneInByBetSize[betSize];
  if (topPrizeOneIn === undefined) {
    throw new Error(`Official top-prize probability is missing for ${product} betSize ${betSize}`);
  }
  const pricePerBetCents = rule.simplePriceCents * simpleEquivalentCountValue;

  return {
    product,
    betSize,
    gameCount,
    simpleEquivalentCount: simpleEquivalentCountValue,
    pricePerBetCents,
    totalPriceCents: pricePerBetCents * gameCount,
    topPrizeOneIn,
    rule: {
      version: rule.version,
      effectiveFrom: rule.effectiveFrom,
      verifiedAt: rule.verifiedAt,
      sourceUrl: rule.sourceUrl,
    },
  };
}
