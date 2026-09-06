export type EvidenceLevel = "none" | "weak" | "moderate";

export interface DistributionSummary {
  mean: number;
  min: number;
  max: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface ProbabilityPoint {
  value: number;
  probability: number;
}

export function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  const weight = position - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

export function summarize(values: number[]): DistributionSummary | null {
  if (values.length === 0) return null;
  return {
    mean: round(mean(values)),
    min: Math.min(...values),
    max: Math.max(...values),
    p10: round(quantile(values, 0.1)),
    p50: round(quantile(values, 0.5)),
    p90: round(quantile(values, 0.9)),
  };
}

export function percentileRank(value: number, values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const belowOrEqual = values.filter((candidate) => candidate <= value).length;
  return round(belowOrEqual / values.length);
}

export function combination(n: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) return 0;
  const selected = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= selected; index += 1) {
    result = (result * (n - selected + index)) / index;
  }
  return result;
}

export function hypergeometricDistribution(
  population: number,
  successStates: number,
  draws: number,
): ProbabilityPoint[] {
  const denominator = combination(population, draws);
  if (denominator === 0) return [];
  const minValue = Math.max(0, draws - (population - successStates));
  const maxValue = Math.min(draws, successStates);
  const points: ProbabilityPoint[] = [];
  for (let value = minValue; value <= maxValue; value += 1) {
    points.push({
      value,
      probability: round(
        (combination(successStates, value) * combination(population - successStates, draws - value)) /
          denominator,
        8,
      ),
    });
  }
  return points;
}

function binomialProbabilityTable(trials: number, probability: number): number[] {
  if (!Number.isInteger(trials) || trials < 0 || probability < 0 || probability > 1) return [];
  if (probability === 0) return Array.from({ length: trials + 1 }, (_, index) => index === 0 ? 1 : 0);
  if (probability === 1) return Array.from({ length: trials + 1 }, (_, index) => index === trials ? 1 : 0);

  const logFactorials = Array.from({ length: trials + 1 }, () => 0);
  for (let index = 1; index <= trials; index += 1) {
    logFactorials[index] = logFactorials[index - 1]! + Math.log(index);
  }
  const logP = Math.log(probability);
  const logQ = Math.log1p(-probability);
  return Array.from({ length: trials + 1 }, (_, observed) => {
    const logProbability =
      logFactorials[trials]! -
      logFactorials[observed]! -
      logFactorials[trials - observed]! +
      observed * logP +
      (trials - observed) * logQ;
    return logProbability < -745 ? 0 : Math.exp(logProbability);
  });
}

function exactTwoSidedFromTable(probabilities: number[], observed: number): number {
  if (!Number.isInteger(observed) || observed < 0 || observed >= probabilities.length) return 1;
  const observedProbability = probabilities[observed] ?? 0;
  const threshold = observedProbability * (1 + 1e-12) + Number.EPSILON;
  return Math.max(0, Math.min(1, probabilities.reduce(
    (sum, probability) => probability <= threshold ? sum + probability : sum,
    0,
  )));
}

export function exactBinomialTwoSidedP(
  observed: number,
  trials: number,
  probability: number,
): number {
  return exactTwoSidedFromTable(binomialProbabilityTable(trials, probability), observed);
}

export function exactBinomialLookup(trials: number, probability: number) {
  const probabilities = binomialProbabilityTable(trials, probability);
  const cache = new Map<number, number>();
  return (observed: number): number => {
    const cached = cache.get(observed);
    if (cached !== undefined) return cached;
    const value = exactTwoSidedFromTable(probabilities, observed);
    cache.set(observed, value);
    return value;
  };
}

export function expectedFromDistribution(points: ProbabilityPoint[]): number {
  return points.reduce((sum, point) => sum + point.value * point.probability, 0);
}

export function varianceFromDistribution(points: ProbabilityPoint[], expected: number): number {
  return points.reduce(
    (sum, point) => sum + ((point.value - expected) ** 2) * point.probability,
    0,
  );
}

function normalCdf(value: number): number {
  const abs = Math.abs(value);
  const t = 1 / (1 + 0.2316419 * abs);
  const density = 0.3989422804014327 * Math.exp(-(abs * abs) / 2);
  const polynomial =
    t * (0.319381530 +
      t * (-0.356563782 +
        t * (1.781477937 +
          t * (-1.821255978 + t * 1.330274429))));
  const cdf = 1 - density * polynomial;
  return value >= 0 ? cdf : 1 - cdf;
}

export function twoSidedNormalP(zScore: number): number {
  if (!Number.isFinite(zScore)) return 1;
  return Math.max(0, Math.min(1, 2 * (1 - normalCdf(Math.abs(zScore)))));
}

export function evidenceLevel(adjustedPValue: number): EvidenceLevel {
  if (adjustedPValue < 0.01) return "moderate";
  if (adjustedPValue < 0.05) return "weak";
  return "none";
}
