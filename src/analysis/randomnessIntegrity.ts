import type { Contest, LotteryConfig } from "../domain/types.js";
import {
  exactBinomialLookup,
  mean,
  quantile,
  round,
} from "./statistics.js";

export const RANDOMNESS_AUDIT_VERSION = "randomness-integrity-v1";
export const RANDOMNESS_AUDIT_GLOBAL_TESTS = 6;
export const RANDOMNESS_AUDIT_DEFAULT_SAMPLES = 400;
export const RANDOMNESS_AUDIT_MIN_CONTESTS = 50;

export type RandomnessAuditStatus = "compatible" | "investigate" | "insufficient-evidence";

export interface RandomnessAuditMetric {
  id: "uniformity" | "entropy" | "sum-runs" | "sum-autocorrelation" | "parity-autocorrelation" | "consecutive-overlap";
  label: string;
  observed: number;
  nullMedian: number;
  nullP05: number;
  nullP95: number;
  pValue: number;
  adjustedPValue: number;
  status: RandomnessAuditStatus;
  nullHypothesis: string;
  limitation: string;
}

export interface RandomnessNumberAudit {
  number: number;
  observed: number;
  expected: number;
  pValue: number;
  adjustedPValue: number;
  status: RandomnessAuditStatus;
}

export interface RandomnessIntegrityAudit {
  version: typeof RANDOMNESS_AUDIT_VERSION;
  available: boolean;
  status: RandomnessAuditStatus;
  methodology: {
    baseline: "uniform-without-replacement";
    correction: string;
    samples: number;
    seed: string;
    pValueResolution: number;
    predictive: false;
    note: string;
  };
  scope: {
    sourceContests: number;
    analyzedContests: number;
    firstContest?: number;
    lastContest?: number;
    excludedBeforeSegment: number;
    gapDetected: boolean;
    regimeChangeDetected: boolean;
    continuous: boolean;
  };
  metrics: RandomnessAuditMetric[];
  perNumber: RandomnessNumberAudit[];
}

interface HistoryStats {
  uniformity: number;
  entropy: number;
  runs: number;
  sumAutocorrelation: number;
  parityAutocorrelation: number;
  consecutiveOverlap: number;
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

function sampleDraw(config: LotteryConfig, random: () => number): number[] {
  const pool = Array.from(
    { length: config.maxNumber - config.minNumber + 1 },
    (_, index) => config.minNumber + index,
  );
  const selected: number[] = [];
  while (selected.length < config.drawSize) {
    const index = Math.floor(random() * pool.length);
    selected.push(pool.splice(index, 1)[0]!);
  }
  return selected.sort((a, b) => a - b);
}

function correlation(values: number[]): number {
  if (values.length < 3) return 0;
  const left = values.slice(0, -1);
  const right = values.slice(1);
  const leftMean = mean(left);
  const rightMean = mean(right);
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]! - leftMean;
    const b = right[index]! - rightMean;
    covariance += a * b;
    leftVariance += a * a;
    rightVariance += b * b;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator > 0 ? covariance / denominator : 0;
}

function runs(values: number[], threshold: number): number {
  if (values.length === 0) return 0;
  let count = 1;
  let previous = values[0]! >= threshold;
  for (const value of values.slice(1)) {
    const current = value >= threshold;
    if (current !== previous) count += 1;
    previous = current;
  }
  return count;
}

function overlap(left: number[], right: number[]): number {
  const set = new Set(left);
  return right.reduce((count, value) => count + (set.has(value) ? 1 : 0), 0);
}

function historyStats(draws: number[][], config: LotteryConfig): HistoryStats {
  const universeSize = config.maxNumber - config.minNumber + 1;
  const counts = Array(universeSize).fill(0) as number[];
  const sums: number[] = [];
  const oddCounts: number[] = [];
  const overlaps: number[] = [];
  for (let index = 0; index < draws.length; index += 1) {
    const draw = draws[index]!;
    for (const value of draw) counts[value - config.minNumber]! += 1;
    sums.push(draw.reduce((sum, value) => sum + value, 0));
    oddCounts.push(draw.filter((value) => value % 2 !== 0).length);
    if (index > 0) overlaps.push(overlap(draws[index - 1]!, draw));
  }
  const expectedCount = draws.length * config.drawSize / universeSize;
  const uniformity = expectedCount > 0
    ? counts.reduce((sum, count) => sum + ((count - expectedCount) ** 2) / expectedCount, 0)
    : 0;
  const totalSelections = draws.length * config.drawSize;
  const probabilities = totalSelections > 0 ? counts.map((count) => count / totalSelections) : [];
  const entropy = probabilities.reduce(
    (sum, probability) => probability > 0 ? sum - probability * Math.log(probability) : sum,
    0,
  );
  const normalizedEntropy = universeSize > 1 ? entropy / Math.log(universeSize) : 1;
  const theoreticalMeanSum = config.drawSize * (config.minNumber + config.maxNumber) / 2;
  return {
    uniformity: round(uniformity, 6),
    entropy: round(normalizedEntropy, 8),
    runs: runs(sums, theoreticalMeanSum),
    sumAutocorrelation: round(correlation(sums), 8),
    parityAutocorrelation: round(correlation(oddCounts), 8),
    consecutiveOverlap: round(mean(overlaps), 8),
  };
}

function latestComparableSegment(contests: Contest[], config: LotteryConfig) {
  const scoped = contests
    .filter((contest) => contest.lottery === config.id)
    .sort((a, b) => a.number - b.number);
  if (scoped.length === 0) {
    return {
      source: scoped,
      segment: scoped,
      gapDetected: false,
      regimeChangeDetected: false,
    };
  }
  const currentShape = config.drawSize;
  let start = scoped.length - 1;
  let gapDetected = false;
  let regimeChangeDetected = scoped.some((contest) => contest.numbers.length !== currentShape);
  while (start > 0) {
    const current = scoped[start]!;
    const previous = scoped[start - 1]!;
    if (current.numbers.length !== currentShape || previous.numbers.length !== currentShape) {
      regimeChangeDetected = true;
      break;
    }
    if (current.number !== previous.number + 1) {
      gapDetected = true;
      break;
    }
    start -= 1;
  }
  const segment = scoped.slice(start).filter((contest) => contest.numbers.length === currentShape);
  if (start > 0 && scoped[start]!.number !== scoped[start - 1]!.number + 1) gapDetected = true;
  return { source: scoped, segment, gapDetected, regimeChangeDetected };
}

function empiricalTwoSidedP(observed: number, simulated: number[]): number {
  if (simulated.length === 0) return 1;
  const center = quantile(simulated, 0.5);
  const distance = Math.abs(observed - center);
  const extreme = simulated.filter((value) => Math.abs(value - center) >= distance).length;
  return (extreme + 1) / (simulated.length + 1);
}

function empiricalUpperP(observed: number, simulated: number[]): number {
  if (simulated.length === 0) return 1;
  const extreme = simulated.filter((value) => value >= observed).length;
  return (extreme + 1) / (simulated.length + 1);
}

function empiricalLowerP(observed: number, simulated: number[]): number {
  if (simulated.length === 0) return 1;
  const extreme = simulated.filter((value) => value <= observed).length;
  return (extreme + 1) / (simulated.length + 1);
}

function auditStatus(adjustedPValue: number, eligible: boolean): RandomnessAuditStatus {
  if (!eligible) return "insufficient-evidence";
  return adjustedPValue < 0.05 ? "investigate" : "compatible";
}

export function buildRandomnessIntegrityAudit(
  contests: Contest[],
  config: LotteryConfig,
  options: { samples?: number; seed?: string } = {},
): RandomnessIntegrityAudit {
  const scoped = latestComparableSegment(contests, config);
  const sampleCount = Math.max(200, Math.min(2_000, Math.round(options.samples ?? RANDOMNESS_AUDIT_DEFAULT_SAMPLES)));
  const first = scoped.segment.at(0);
  const last = scoped.segment.at(-1);
  const seed = options.seed
    ?? `randomness-audit:${config.id}:${first?.number ?? 0}:${last?.number ?? 0}:${scoped.segment.length}:v1`;
  const eligible = scoped.segment.length >= RANDOMNESS_AUDIT_MIN_CONTESTS;
  const base = {
    version: RANDOMNESS_AUDIT_VERSION as typeof RANDOMNESS_AUDIT_VERSION,
    methodology: {
      baseline: "uniform-without-replacement" as const,
      correction: `bonferroni-${RANDOMNESS_AUDIT_GLOBAL_TESTS}-global-tests; bonferroni-${config.maxNumber - config.minNumber + 1}-per-number-tests`,
      samples: sampleCount,
      seed,
      pValueResolution: round(1 / (sampleCount + 1), 6),
      predictive: false as const,
      note: "Auditoria descritiva de compatibilidade com sorteios uniformes sem reposição. Um sinal pede investigação de dados/metodologia; não implica previsibilidade nem prova ausência/presença de manipulação.",
    },
    scope: {
      sourceContests: scoped.source.length,
      analyzedContests: scoped.segment.length,
      ...(first ? { firstContest: first.number } : {}),
      ...(last ? { lastContest: last.number } : {}),
      excludedBeforeSegment: scoped.source.length - scoped.segment.length,
      gapDetected: scoped.gapDetected,
      regimeChangeDetected: scoped.regimeChangeDetected,
      continuous: !scoped.gapDetected,
    },
  };

  if (!eligible) {
    return {
      ...base,
      available: false,
      status: "insufficient-evidence",
      metrics: [],
      perNumber: [],
    };
  }

  const observedDraws = scoped.segment.map((contest) => [...contest.numbers].sort((a, b) => a - b));
  const observed = historyStats(observedDraws, config);
  const random = seededRandom(seed);
  const simulated: Record<keyof HistoryStats, number[]> = {
    uniformity: [],
    entropy: [],
    runs: [],
    sumAutocorrelation: [],
    parityAutocorrelation: [],
    consecutiveOverlap: [],
  };
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const draws = Array.from({ length: observedDraws.length }, () => sampleDraw(config, random));
    const stats = historyStats(draws, config);
    for (const key of Object.keys(simulated) as Array<keyof HistoryStats>) {
      simulated[key].push(stats[key]);
    }
  }

  const definitions: Array<{
    id: RandomnessAuditMetric["id"];
    label: string;
    key: keyof HistoryStats;
    p: (observedValue: number, values: number[]) => number;
    nullHypothesis: string;
    limitation: string;
  }> = [
    {
      id: "uniformity",
      label: "Uniformidade global",
      key: "uniformity",
      p: empiricalUpperP,
      nullHypothesis: "As frequências globais são compatíveis com dezenas equiprováveis em sorteios sem reposição.",
      limitation: "O teste global detecta desvios agregados, mas não identifica causa operacional nem capacidade preditiva.",
    },
    {
      id: "entropy",
      label: "Entropia das frequências",
      key: "entropy",
      p: empiricalLowerP,
      nullHypothesis: "A concentração das frequências é compatível com o baseline uniforme.",
      limitation: "Entropia resume concentração e não testa independência temporal sozinha.",
    },
    {
      id: "sum-runs",
      label: "Runs da soma",
      key: "runs",
      p: empiricalTwoSidedP,
      nullHypothesis: "A alternância da soma em torno da média teórica é compatível com sorteios independentes.",
      limitation: "Runs reduz a sequência a dois estados e pode perder outras formas de dependência.",
    },
    {
      id: "sum-autocorrelation",
      label: "Autocorrelação da soma",
      key: "sumAutocorrelation",
      p: empiricalTwoSidedP,
      nullHypothesis: "A autocorrelação lag-1 das somas é compatível com independência entre concursos.",
      limitation: "Avalia apenas dependência linear lag-1 da soma.",
    },
    {
      id: "parity-autocorrelation",
      label: "Autocorrelação de paridade",
      key: "parityAutocorrelation",
      p: empiricalTwoSidedP,
      nullHypothesis: "A autocorrelação lag-1 da quantidade de ímpares é compatível com independência.",
      limitation: "Resume estrutura por paridade e não cobre todas as propriedades do sorteio.",
    },
    {
      id: "consecutive-overlap",
      label: "Sobreposição consecutiva",
      key: "consecutiveOverlap",
      p: empiricalTwoSidedP,
      nullHypothesis: "A repetição média entre concursos consecutivos é compatível com sorteios uniformes sem reposição.",
      limitation: "Avalia apenas a média de overlap entre pares consecutivos.",
    },
  ];

  const metrics = definitions.map((definition) => {
    const values = simulated[definition.key];
    const pValue = definition.p(observed[definition.key], values);
    const adjustedPValue = Math.min(1, pValue * RANDOMNESS_AUDIT_GLOBAL_TESTS);
    return {
      id: definition.id,
      label: definition.label,
      observed: round(observed[definition.key], 8),
      nullMedian: round(quantile(values, 0.5), 8),
      nullP05: round(quantile(values, 0.05), 8),
      nullP95: round(quantile(values, 0.95), 8),
      pValue: round(pValue, 6),
      adjustedPValue: round(adjustedPValue, 6),
      status: auditStatus(adjustedPValue, true),
      nullHypothesis: definition.nullHypothesis,
      limitation: definition.limitation,
    } satisfies RandomnessAuditMetric;
  });

  const universeSize = config.maxNumber - config.minNumber + 1;
  const expected = scoped.segment.length * config.drawSize / universeSize;
  const exactP = exactBinomialLookup(scoped.segment.length, config.drawSize / universeSize);
  const counts = new Map<number, number>();
  for (const draw of observedDraws) {
    for (const number of draw) counts.set(number, (counts.get(number) ?? 0) + 1);
  }
  const perNumber = Array.from({ length: universeSize }, (_, index) => {
    const number = config.minNumber + index;
    const observedCount = counts.get(number) ?? 0;
    const pValue = exactP(observedCount);
    const adjustedPValue = Math.min(1, pValue * universeSize);
    return {
      number,
      observed: observedCount,
      expected: round(expected, 4),
      pValue: round(pValue, 6),
      adjustedPValue: round(adjustedPValue, 6),
      status: auditStatus(adjustedPValue, true),
    } satisfies RandomnessNumberAudit;
  });

  const status = metrics.some((metric) => metric.status === "investigate")
    || perNumber.some((item) => item.status === "investigate")
    ? "investigate"
    : "compatible";

  return {
    ...base,
    available: true,
    status,
    metrics,
    perNumber,
  };
}
