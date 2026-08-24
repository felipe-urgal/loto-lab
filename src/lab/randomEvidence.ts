export type RandomEvidenceStatus =
  | "beats-random"
  | "inconclusive"
  | "no-evidence"
  | "underperforms-random";

export interface RandomEvidenceResult {
  percentile: number;
  median: number;
  rawUpperPValue: number;
  rawLowerPValue: number;
  adjustedUpperPValue: number;
  adjustedLowerPValue: number;
  familySize: number;
  status: RandomEvidenceStatus;
}

export function percentile(values: number[], probability: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  const fraction = position - lower;
  return sorted[lower]! * (1 - fraction) + sorted[upper]! * fraction;
}

export function midRankPercentile(values: number[], value: number): number {
  if (values.length === 0) return 0.5;
  const below = values.filter((candidate) => candidate < value).length;
  const tied = values.filter((candidate) => candidate === value).length;
  return (below + tied * 0.5) / values.length;
}

export function evaluateRandomEvidence(
  values: number[],
  value: number,
  familySize = 1,
): RandomEvidenceResult {
  const valid = values.filter(Number.isFinite);
  const normalizedFamilySize = Math.max(1, Math.round(familySize));
  if (valid.length === 0 || !Number.isFinite(value)) {
    return {
      percentile: 0.5,
      median: 0,
      rawUpperPValue: 1,
      rawLowerPValue: 1,
      adjustedUpperPValue: 1,
      adjustedLowerPValue: 1,
      familySize: normalizedFamilySize,
      status: "no-evidence",
    };
  }

  // Ties count against a superiority/inferiority claim. The +1 correction
  // prevents a Monte Carlo p-value from becoming zero.
  const rawUpperPValue = (1 + valid.filter((candidate) => candidate >= value).length) / (valid.length + 1);
  const rawLowerPValue = (1 + valid.filter((candidate) => candidate <= value).length) / (valid.length + 1);
  const adjustedUpperPValue = Math.min(1, rawUpperPValue * normalizedFamilySize);
  const adjustedLowerPValue = Math.min(1, rawLowerPValue * normalizedFamilySize);
  const median = percentile(valid, 0.5);

  let status: RandomEvidenceStatus = "no-evidence";
  if (value > median && adjustedUpperPValue <= 0.05) status = "beats-random";
  else if (value < median && adjustedLowerPValue <= 0.05) status = "underperforms-random";
  else if (rawUpperPValue <= 0.1 || rawLowerPValue <= 0.1) status = "inconclusive";

  return {
    percentile: midRankPercentile(valid, value),
    median,
    rawUpperPValue,
    rawLowerPValue,
    adjustedUpperPValue,
    adjustedLowerPValue,
    familySize: normalizedFamilySize,
    status,
  };
}
