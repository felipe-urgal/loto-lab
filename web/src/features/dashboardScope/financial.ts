import type { RealBetSummaryDto } from "./types.js";

export type AggregateRealFinancial = {
  checkedCost: number | undefined;
  netResult: number | undefined;
  roi: number | undefined;
};

export function knownNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function toneFor(value: unknown): "positive" | "negative" | "" {
  const numeric = knownNumber(value);
  if (numeric === undefined) return "";
  return numeric >= 0 ? "positive" : "negative";
}

export function aggregateRealFinancial(
  summaries: RealBetSummaryDto[],
): AggregateRealFinancial {
  const costs = summaries.map((summary) => knownNumber(summary.checkedCost));
  const results = summaries.map((summary) => knownNumber(summary.netResult));
  const checkedCost = costs.every((value): value is number => value !== undefined)
    ? costs.reduce((total, value) => total + value, 0)
    : undefined;
  const netResult = results.every((value): value is number => value !== undefined)
    ? results.reduce((total, value) => total + value, 0)
    : undefined;
  const roi = checkedCost !== undefined && netResult !== undefined && checkedCost > 0
    ? netResult / checkedCost
    : undefined;

  return { checkedCost, netResult, roi };
}
