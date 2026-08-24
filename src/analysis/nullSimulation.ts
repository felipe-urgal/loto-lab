export interface NullDistributionSummary {
  samples: number;
  observed: number;
  p05: number;
  p50: number;
  p95: number;
  percentile: number;
  twoSidedPValue: number;
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function quantile(values: number[], probability: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  const weight = position - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  state >>>= 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function pairedSignFlipNull(
  pairedDifferences: number[],
  samples = 1000,
  seed = "loto-lab:null-sign-flip:v1",
): NullDistributionSummary {
  const valid = pairedDifferences.filter(Number.isFinite);
  const observed = valid.length === 0
    ? 0
    : valid.reduce((sum, value) => sum + value, 0) / valid.length;
  if (valid.length === 0) {
    return { samples: 0, observed: 0, p05: 0, p50: 0, p95: 0, percentile: 0.5, twoSidedPValue: 1 };
  }

  const count = Math.max(100, Math.min(10_000, Math.round(samples)));
  const random = seededRandom(seed);
  const simulated: number[] = [];
  for (let sample = 0; sample < count; sample += 1) {
    let total = 0;
    for (const difference of valid) total += (random() < 0.5 ? -1 : 1) * difference;
    simulated.push(total / valid.length);
  }

  const belowOrEqual = simulated.filter((value) => value <= observed).length;
  const atLeastAsExtreme = simulated.filter((value) => Math.abs(value) >= Math.abs(observed)).length;
  return {
    samples: count,
    observed: round(observed),
    p05: round(quantile(simulated, 0.05)),
    p50: round(quantile(simulated, 0.5)),
    p95: round(quantile(simulated, 0.95)),
    percentile: round(belowOrEqual / count),
    twoSidedPValue: round((atLeastAsExtreme + 1) / (count + 1)),
  };
}
