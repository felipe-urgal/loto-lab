import { assertValidGameCount, combinationCount } from "./betRules.js";

export interface StructuredBetQuote {
  betSize: number;
  simpleEquivalentCount: number;
  totalPriceCents: number;
  rule: {
    effectiveFrom: string;
    sourceUrl: string;
  };
}

export function quoteMaisMilionaria(
  numberCount: number,
  cloverCount: number,
  gameCount = 1,
): StructuredBetQuote {
  assertValidGameCount(gameCount);
  if (!Number.isInteger(numberCount) || numberCount < 6 || numberCount > 12) {
    throw new Error("+Milionaria number count must be between 6 and 12");
  }
  if (!Number.isInteger(cloverCount) || cloverCount < 2 || cloverCount > 6) {
    throw new Error("+Milionaria clover count must be between 2 and 6");
  }
  const simpleEquivalentCount = combinationCount(numberCount, 6) * combinationCount(cloverCount, 2);
  return {
    betSize: numberCount,
    simpleEquivalentCount,
    totalPriceCents: simpleEquivalentCount * 600 * gameCount,
    rule: {
      effectiveFrom: "2026-09-30",
      sourceUrl: "https://loterias.caixa.gov.br/Paginas/Mais-Milionaria.aspx",
    },
  };
}

export function quoteTimemania(gameCount = 1): StructuredBetQuote {
  assertValidGameCount(gameCount);
  return {
    betSize: 10,
    simpleEquivalentCount: 1,
    totalPriceCents: 350 * gameCount,
    rule: {
      effectiveFrom: "2026-09-30",
      sourceUrl: "https://loterias.caixa.gov.br/Paginas/Timemania.aspx",
    },
  };
}

export function validateSuperSeteColumnMarks(columnMarks: number[]): number {
  if (
    columnMarks.length !== 7
    || columnMarks.some((count) => !Number.isInteger(count) || count < 1 || count > 3)
  ) {
    throw new Error("Super Sete requires seven columns with 1 to 3 marks each");
  }
  const total = columnMarks.reduce((sum, count) => sum + count, 0);
  if (total < 7 || total > 21) throw new Error("Super Sete total marks must be between 7 and 21");
  if (total <= 14 && columnMarks.some((count) => count > 2)) {
    throw new Error("Super Sete bets with 8 to 14 marks allow at most 2 marks per column");
  }
  if (total >= 15 && columnMarks.some((count) => count < 2)) {
    throw new Error("Super Sete bets with 15 to 21 marks require at least 2 marks per column");
  }
  return total;
}

export function quoteSuperSete(
  columnMarks: number[],
  gameCount = 1,
): StructuredBetQuote {
  assertValidGameCount(gameCount);
  const totalMarks = validateSuperSeteColumnMarks(columnMarks);
  const simpleEquivalentCount = columnMarks.reduce((value, count) => value * count, 1);
  return {
    betSize: totalMarks,
    simpleEquivalentCount,
    totalPriceCents: simpleEquivalentCount * 300 * gameCount,
    rule: {
      effectiveFrom: "2026-09-30",
      sourceUrl: "https://loterias.caixa.gov.br/Paginas/Super-Sete.aspx",
    },
  };
}
