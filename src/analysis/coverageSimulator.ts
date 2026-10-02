import type { GeneratedGame, LotteryId } from "../domain/types.js";
import { createSeededRandom } from "../generator/shared.js";
import { getLotteryConfig } from "../lotteries/config.js";

export const COVERAGE_SIMULATOR_VERSION = "coverage-simulator-v1";
export const MAX_EXACT_DRAWS = 200_000;
export const MIN_MONTE_CARLO_SAMPLES = 1_000;
export const MAX_MONTE_CARLO_SAMPLES = 100_000;
export const DEFAULT_MONTE_CARLO_SAMPLES = 20_000;
export const DEFAULT_MAX_MARGIN_ERROR = 0.01;

export type CoverageSimulationMethod = "exact" | "monte-carlo";

export interface CoverageSpaceOptions {
  universe: number[];
  drawSize: number;
  games: number[][];
  seed?: string;
  samples?: number;
  exactDrawLimit?: number;
  maxMarginError?: number;
}

export interface CoverageSimulationOptions {
  lottery: LotteryId;
  games: GeneratedGame[];
  seed?: string;
  samples?: number;
  exactDrawLimit?: number;
  maxMarginError?: number;
}

export interface HitDistributionEntry {
  hits: number;
  count: number;
  probability: number;
}

export interface AtLeastProbability {
  hits: number;
  probability: number;
}

export interface CoverageSimulationQuality {
  exact: boolean;
  samples: number;
  resolution: number;
  maxMarginError95: number;
  requestedMaxMarginError: number;
  sufficient: boolean;
}

export interface CoverageSimulationResult {
  algorithm: typeof COVERAGE_SIMULATOR_VERSION;
  lottery: LotteryId;
  method: CoverageSimulationMethod;
  seed: string;
  drawSize: number;
  universeSize: number;
  gameCount: number;
  uniqueGameCount: number;
  ticketSizes: number[];
  evaluatedDraws: number;
  distribution: HitDistributionEntry[];
  atLeast: AtLeastProbability[];
  expectedBestHits: number;
  quality: CoverageSimulationQuality;
  scope: {
    synthetic: true;
    historicalDataUsed: false;
    primaryNumbersOnly: true;
    note: string;
  };
}

export interface CoverageBenchmarkResult {
  algorithm: typeof COVERAGE_SIMULATOR_VERSION;
  seed: string;
  target: CoverageSimulationResult;
  randomBaseline: CoverageSimulationResult;
  comparison: {
    expectedBestHitsDelta: number;
    atLeastDelta: AtLeastProbability[];
  };
}

function round(value: number, digits = 8): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function combinationCount(n: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) return 0;
  const size = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= size; index += 1) {
    result = (result * (n - size + index)) / index;
  }
  return Math.round(result);
}

function combinations(values: number[], size: number): number[][] {
  const result: number[][] = [];
  const current: number[] = [];
  const walk = (start: number): void => {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    const needed = size - current.length;
    for (let index = start; index <= values.length - needed; index += 1) {
      current.push(values[index]!);
      walk(index + 1);
      current.pop();
    }
  };
  walk(0);
  return result;
}

function normalizeGames(lottery: LotteryId, games: GeneratedGame[]): number[][] {
  const config = getLotteryConfig(lottery);
  return games.map((game, index) => {
    if (game.lottery !== lottery) {
      throw new Error(`Coverage simulation game ${index + 1} belongs to another lottery`);
    }
    const numbers = [...game.numbers].sort((a, b) => a - b);
    if (numbers.length < config.drawSize || numbers.length > config.maxNumber - config.minNumber + 1) {
      throw new Error(`Coverage simulation game ${index + 1} has invalid bet size`);
    }
    if (numbers.length !== new Set(numbers).size) {
      throw new Error(`Coverage simulation game ${index + 1} contains duplicate numbers`);
    }
    if (numbers.some((value) =>
      !Number.isInteger(value) || value < config.minNumber || value > config.maxNumber
    )) {
      throw new Error(`Coverage simulation game ${index + 1} contains a number outside the lottery universe`);
    }
    return numbers;
  });
}

function sampleDraw(universe: number[], drawSize: number, random: () => number): number[] {
  const pool = [...universe];
  const draw: number[] = [];
  while (draw.length < drawSize) {
    const index = Math.floor(random() * pool.length);
    draw.push(pool.splice(index, 1)[0]!);
  }
  return draw.sort((a, b) => a - b);
}

function bestHits(games: number[][], draw: number[]): number {
  if (games.length === 0) return 0;
  const drawn = new Set(draw);
  let best = 0;
  for (const game of games) {
    let hits = 0;
    for (const value of game) if (drawn.has(value)) hits += 1;
    if (hits > best) best = hits;
  }
  return best;
}

function quality(
  exact: boolean,
  samples: number,
  requestedMaxMarginError: number,
): CoverageSimulationQuality {
  if (exact) {
    return {
      exact: true,
      samples,
      resolution: samples > 0 ? round(1 / samples) : 0,
      maxMarginError95: 0,
      requestedMaxMarginError,
      sufficient: true,
    };
  }
  const resolution = samples > 0 ? 1 / samples : 1;
  const margin = samples > 0 ? 1.96 * Math.sqrt(0.25 / samples) : 1;
  return {
    exact: false,
    samples,
    resolution: round(resolution),
    maxMarginError95: round(margin),
    requestedMaxMarginError,
    sufficient: margin <= requestedMaxMarginError,
  };
}

function resultFromCounts(
  options: {
    lottery: LotteryId;
    seed: string;
    games: number[][];
    method: CoverageSimulationMethod;
    drawSize: number;
    universeSize: number;
    requestedMaxMarginError: number;
  },
  counts: number[],
): CoverageSimulationResult {
  const evaluatedDraws = counts.reduce((sum, value) => sum + value, 0);
  const distribution = counts.map((count, hits) => ({
    hits,
    count,
    probability: evaluatedDraws > 0 ? round(count / evaluatedDraws) : 0,
  }));
  const atLeast = counts.map((_, hits) => ({
    hits,
    probability: evaluatedDraws > 0
      ? round(counts.slice(hits).reduce((sum, value) => sum + value, 0) / evaluatedDraws)
      : 0,
  }));
  const expectedBestHits = evaluatedDraws > 0
    ? counts.reduce((sum, count, hits) => sum + hits * count, 0) / evaluatedDraws
    : 0;
  const ticketSizes = [...new Set(options.games.map((game) => game.length))].sort((a, b) => a - b);
  const uniqueGameCount = new Set(options.games.map((game) => game.join("-"))).size;
  return {
    algorithm: COVERAGE_SIMULATOR_VERSION,
    lottery: options.lottery,
    method: options.method,
    seed: options.seed,
    drawSize: options.drawSize,
    universeSize: options.universeSize,
    gameCount: options.games.length,
    uniqueGameCount,
    ticketSizes,
    evaluatedDraws,
    distribution,
    atLeast,
    expectedBestHits: round(expectedBestHits),
    quality: quality(
      options.method === "exact",
      evaluatedDraws,
      options.requestedMaxMarginError,
    ),
    scope: {
      synthetic: true,
      historicalDataUsed: false,
      primaryNumbersOnly: true,
      note: "Cobertura sintética das dezenas principais; não usa histórico e não representa previsão.",
    },
  };
}

function simulateSpaceCounts(options: CoverageSpaceOptions): {
  method: CoverageSimulationMethod;
  seed: string;
  requestedMaxMarginError: number;
  counts: number[];
} {
  const universe = [...options.universe].sort((a, b) => a - b);
  if (universe.length !== new Set(universe).size || universe.some((value) => !Number.isInteger(value))) {
    throw new Error("Coverage simulation universe must contain unique integers");
  }
  if (!Number.isInteger(options.drawSize) || options.drawSize < 1 || options.drawSize > universe.length) {
    throw new Error("Coverage simulation drawSize must fit the universe");
  }
  const allowed = new Set(universe);
  for (let index = 0; index < options.games.length; index += 1) {
    const game = options.games[index]!;
    if (game.length < options.drawSize || game.length > universe.length) {
      throw new Error(`Coverage simulation game ${index + 1} has invalid bet size`);
    }
    if (game.length !== new Set(game).size || game.some((value) => !allowed.has(value))) {
      throw new Error(`Coverage simulation game ${index + 1} is invalid for the simulation universe`);
    }
  }
  const exactDrawLimit = Math.max(1, Math.min(
    MAX_EXACT_DRAWS,
    Math.round(options.exactDrawLimit ?? MAX_EXACT_DRAWS),
  ));
  const totalDraws = combinationCount(universe.length, options.drawSize);
  const seed = options.seed ?? "loto-lab:coverage-simulator:v1";
  const requestedMaxMarginError = options.maxMarginError ?? DEFAULT_MAX_MARGIN_ERROR;
  if (!Number.isFinite(requestedMaxMarginError) || requestedMaxMarginError <= 0 || requestedMaxMarginError >= 1) {
    throw new Error("Coverage simulation maxMarginError must be between 0 and 1");
  }
  if (totalDraws <= exactDrawLimit) {
    const counts = Array(options.drawSize + 1).fill(0) as number[];
    for (const draw of combinations(universe, options.drawSize)) {
      counts[bestHits(options.games, draw)]! += 1;
    }
    return { method: "exact", seed, requestedMaxMarginError, counts };
  }
  const samples = Math.max(
    MIN_MONTE_CARLO_SAMPLES,
    Math.min(MAX_MONTE_CARLO_SAMPLES, Math.round(options.samples ?? DEFAULT_MONTE_CARLO_SAMPLES)),
  );
  const random = createSeededRandom(seed);
  const counts = Array(options.drawSize + 1).fill(0) as number[];
  for (let index = 0; index < samples; index += 1) {
    const draw = sampleDraw(universe, options.drawSize, random);
    counts[bestHits(options.games, draw)]! += 1;
  }
  return { method: "monte-carlo", seed, requestedMaxMarginError, counts };
}

export function simulateCoverageSpace(options: CoverageSpaceOptions) {
  const simulation = simulateSpaceCounts(options);
  const evaluatedDraws = simulation.counts.reduce((sum, value) => sum + value, 0);
  const distribution = simulation.counts.map((count, hits) => ({
    hits,
    count,
    probability: evaluatedDraws > 0 ? round(count / evaluatedDraws) : 0,
  }));
  const atLeast = simulation.counts.map((_, hits) => ({
    hits,
    probability: evaluatedDraws > 0
      ? round(simulation.counts.slice(hits).reduce((sum, value) => sum + value, 0) / evaluatedDraws)
      : 0,
  }));
  return {
    method: simulation.method,
    seed: simulation.seed,
    evaluatedDraws,
    distribution,
    atLeast,
    expectedBestHits: evaluatedDraws > 0
      ? round(simulation.counts.reduce((sum, count, hits) => sum + hits * count, 0) / evaluatedDraws)
      : 0,
    quality: quality(
      simulation.method === "exact",
      evaluatedDraws,
      simulation.requestedMaxMarginError,
    ),
  };
}

export function simulateCoverage(options: CoverageSimulationOptions): CoverageSimulationResult {
  const config = getLotteryConfig(options.lottery);
  const games = normalizeGames(options.lottery, options.games);
  const universe = Array.from(
    { length: config.maxNumber - config.minNumber + 1 },
    (_, index) => config.minNumber + index,
  );
  const simulation = simulateSpaceCounts({
    universe,
    drawSize: config.drawSize,
    games,
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    ...(options.samples !== undefined ? { samples: options.samples } : {}),
    ...(options.exactDrawLimit !== undefined ? { exactDrawLimit: options.exactDrawLimit } : {}),
    ...(options.maxMarginError !== undefined ? { maxMarginError: options.maxMarginError } : {}),
  });
  return resultFromCounts({
    lottery: options.lottery,
    seed: simulation.seed,
    games,
    method: simulation.method,
    drawSize: config.drawSize,
    universeSize: universe.length,
    requestedMaxMarginError: simulation.requestedMaxMarginError,
  }, simulation.counts);
}

function randomBaselineGames(
  lottery: LotteryId,
  games: GeneratedGame[],
  seed: string,
): GeneratedGame[] {
  const config = getLotteryConfig(lottery);
  const universe = Array.from(
    { length: config.maxNumber - config.minNumber + 1 },
    (_, index) => config.minNumber + index,
  );
  return games.map((game, index) => {
    const random = createSeededRandom(`${seed}:game:${index + 1}`);
    const numbers = sampleDraw(universe, game.numbers.length, random);
    return {
      lottery,
      numbers,
      fixedNumbers: [],
      variableNumbers: [...numbers],
      metadata: {
        odd: numbers.filter((value) => value % 2 !== 0).length,
        even: numbers.filter((value) => value % 2 === 0).length,
        sum: numbers.reduce((sum, value) => sum + value, 0),
        repeatedFromLastContest: [],
      },
    };
  });
}

export function benchmarkCoverage(options: CoverageSimulationOptions): CoverageBenchmarkResult {
  normalizeGames(options.lottery, options.games);
  const seed = options.seed ?? "loto-lab:coverage-benchmark:v1";
  const drawSeed = `${seed}:draws`;
  const target = simulateCoverage({ ...options, seed: drawSeed });
  const baselineGames = randomBaselineGames(options.lottery, options.games, `${seed}:baseline`);
  const randomBaseline = simulateCoverage({
    ...options,
    games: baselineGames,
    seed: drawSeed,
  });
  const atLeastDelta = target.atLeast.map((entry) => ({
    hits: entry.hits,
    probability: round(entry.probability - (randomBaseline.atLeast[entry.hits]?.probability ?? 0)),
  }));
  return {
    algorithm: COVERAGE_SIMULATOR_VERSION,
    seed,
    target,
    randomBaseline,
    comparison: {
      expectedBestHitsDelta: round(target.expectedBestHits - randomBaseline.expectedBestHits),
      atLeastDelta,
    },
  };
}
