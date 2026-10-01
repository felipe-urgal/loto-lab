import type { Contest, GeneratedGame, LotteryId } from "../domain/types.js";
import { getLotteryConfig } from "../lotteries/config.js";
import { matchesGenerationConstraints, type GenerationConstraints } from "./planning.js";
import { buildMetadata, createSeededRandom } from "./shared.js";

export type GenerationPurpose = "uniform" | "portfolio" | "experimental";

const LUCKY_MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

export interface PurposeGenerationOptions {
  lottery: LotteryId;
  gameCount: number;
  fixedCount: number;
  betSize?: number;
  seed: string;
  fixedNumbers?: number[];
  excludedNumbers?: number[];
  constraints?: GenerationConstraints;
  referenceContest?: Contest;
}

function sampleWithoutReplacement(
  values: number[],
  count: number,
  random: () => number,
): number[] {
  if (!Number.isInteger(count) || count < 0 || count > values.length) {
    throw new Error("Invalid sample size");
  }
  const pool = [...values];
  for (let index = 0; index < count; index += 1) {
    const selected = index + Math.floor(random() * (pool.length - index));
    [pool[index], pool[selected]] = [pool[selected]!, pool[index]!];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

function validateSelection(options: PurposeGenerationOptions): void {
  const config = getLotteryConfig(options.lottery);
  const fixed = options.fixedNumbers ?? [];
  const excluded = options.excludedNumbers ?? [];
  const universe = new Set(
    Array.from(
      { length: config.maxNumber - config.minNumber + 1 },
      (_, index) => config.minNumber + index,
    ),
  );
  if (!Number.isInteger(options.gameCount) || options.gameCount < 1) {
    throw new Error("gameCount must be a positive integer");
  }
  const betSize = options.betSize ?? config.defaultBetSize;
  if (!Number.isInteger(betSize) || betSize < config.drawSize || betSize > universe.size) {
    throw new Error("betSize must fit between draw size and lottery universe");
  }
  if (!Number.isInteger(options.fixedCount) || options.fixedCount < 0 || options.fixedCount > betSize) {
    throw new Error("fixedCount must fit inside the bet size");
  }
  if (fixed.length > options.fixedCount) {
    throw new Error("Manual fixed numbers exceed the configured fixed core");
  }
  if (new Set(fixed).size !== fixed.length || new Set(excluded).size !== excluded.length) {
    throw new Error("Fixed and excluded numbers must be unique");
  }
  if (fixed.some((number) => !universe.has(number)) || excluded.some((number) => !universe.has(number))) {
    throw new Error("Fixed or excluded number is outside the lottery universe");
  }
  if (fixed.some((number) => excluded.includes(number))) {
    throw new Error("A number cannot be fixed and excluded at the same time");
  }
  const remainingCapacity = universe.size - excluded.length;
  if (remainingCapacity < betSize) {
    throw new Error("Too many excluded numbers for the requested bet size");
  }
}

function selectSharedCore(
  options: PurposeGenerationOptions,
  random: () => number,
): number[] {
  const config = getLotteryConfig(options.lottery);
  const manualFixed = options.fixedNumbers ?? [];
  const excluded = new Set(options.excludedNumbers ?? []);
  if (options.fixedCount === 0) return [];

  const candidates = Array.from(
    { length: config.maxNumber - config.minNumber + 1 },
    (_, index) => config.minNumber + index,
  ).filter((number) => !excluded.has(number) && !manualFixed.includes(number));
  const needed = options.fixedCount - manualFixed.length;
  return [...manualFixed, ...sampleWithoutReplacement(candidates, needed, random)]
    .sort((a, b) => a - b);
}

function sampleCandidate(
  options: PurposeGenerationOptions,
  sharedCore: number[],
  random: () => number,
): GeneratedGame {
  const config = getLotteryConfig(options.lottery);
  if (options.lottery === "super-sete") {
    const columns = Array.from({ length: 7 }, () => Math.floor(random() * 10));
    return {
      lottery: options.lottery,
      numbers: [],
      fixedNumbers: [],
      variableNumbers: [],
      columns,
      metadata: { odd: 0, even: 0, sum: 0, repeatedFromLastContest: [] },
    };
  }
  const excluded = new Set(options.excludedNumbers ?? []);
  const fixedSet = new Set(sharedCore);
  const candidates = Array.from(
    { length: config.maxNumber - config.minNumber + 1 },
    (_, index) => config.minNumber + index,
  ).filter((number) => !excluded.has(number) && !fixedSet.has(number));
  const betSize = options.betSize ?? config.defaultBetSize;
  const variableCount = betSize - sharedCore.length;
  const variableNumbers = sampleWithoutReplacement(candidates, variableCount, random);
  const numbers = [...sharedCore, ...variableNumbers].sort((a, b) => a - b);
  const metadata = buildMetadata(
    numbers,
    options.referenceContest,
    options.lottery === "lotofacil",
  );
  const luckyMonth = options.lottery === "dia-de-sorte"
    ? LUCKY_MONTHS[Math.floor(random() * LUCKY_MONTHS.length)]
    : undefined;
  const clovers = options.lottery === "mais-milionaria"
    ? sampleWithoutReplacement([1, 2, 3, 4, 5, 6], 2, random)
    : undefined;
  const favoriteTeam = options.lottery === "timemania"
    && options.referenceContest?.secondary?.kind === "favorite-team"
    ? options.referenceContest.secondary.values[0]
    : undefined;
  if (options.lottery === "timemania" && !favoriteTeam) {
    throw new Error("Timemania generation requires a reference contest with Time do Coração");
  }
  const secondary = options.lottery === "dia-de-sorte" && luckyMonth
    ? { kind: "lucky-month" as const, values: [luckyMonth] }
    : clovers
      ? { kind: "clovers" as const, values: clovers }
      : favoriteTeam
        ? { kind: "favorite-team" as const, values: [favoriteTeam] }
        : undefined;
  const mirrorNumbers = options.lottery === "lotomania"
    ? Array.from({ length: 100 }, (_, index) => index).filter((number) => !numbers.includes(number))
    : undefined;
  return {
    lottery: options.lottery,
    numbers,
    fixedNumbers: [...sharedCore],
    variableNumbers,
    ...(mirrorNumbers ? { mirrorNumbers } : {}),
    ...(luckyMonth ? { luckyMonth } : {}),
    ...(secondary ? { secondary } : {}),
    metadata,
  };
}

function candidateKey(game: GeneratedGame): string {
  return [
    game.numbers.join("-"),
    game.luckyMonth ?? "",
    game.secondary ? JSON.stringify(game.secondary) : "",
    game.columns?.join("-") ?? "",
  ].join(":");
}

function overlap(left: GeneratedGame, right: GeneratedGame): number {
  return left.numbers.filter((number) => right.numbers.includes(number)).length;
}

function validCandidate(
  options: PurposeGenerationOptions,
  sharedCore: number[],
  random: () => number,
): GeneratedGame {
  const attemptLimit = 50_000;
  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    const game = sampleCandidate(options, sharedCore, random);
    if (matchesGenerationConstraints(game, options.constraints)) return game;
  }
  throw new Error("Unable to sample a valid game with the requested constraints");
}

export function generateUniformGames(options: PurposeGenerationOptions): GeneratedGame[] {
  validateSelection(options);
  const random = createSeededRandom(options.seed);
  const sharedCore = selectSharedCore(options, random);
  const games: GeneratedGame[] = [];
  const keys = new Set<string>();
  const attemptLimit = Math.max(10_000, options.gameCount * 5_000);

  for (let attempt = 0; games.length < options.gameCount && attempt < attemptLimit; attempt += 1) {
    const game = validCandidate(options, sharedCore, random);
    const key = candidateKey(game);
    if (keys.has(key)) continue;
    keys.add(key);
    games.push(game);
  }
  if (games.length !== options.gameCount) {
    throw new Error("Unable to sample enough unique games with the requested constraints");
  }
  return games;
}

export function generatePortfolioGames(options: PurposeGenerationOptions): GeneratedGame[] {
  validateSelection(options);
  const random = createSeededRandom(options.seed);
  const sharedCore = selectSharedCore(options, random);
  const targetPoolSize = Math.max(128, options.gameCount * 32);
  const pool: GeneratedGame[] = [];
  const keys = new Set<string>();
  const attemptLimit = targetPoolSize * 200;

  for (let attempt = 0; pool.length < targetPoolSize && attempt < attemptLimit; attempt += 1) {
    const game = validCandidate(options, sharedCore, random);
    const key = candidateKey(game);
    if (keys.has(key)) continue;
    keys.add(key);
    pool.push(game);
  }
  if (pool.length < options.gameCount) {
    throw new Error("Unable to build a diversified portfolio with the requested constraints");
  }

  const selected: GeneratedGame[] = [pool.shift()!];
  while (selected.length < options.gameCount) {
    let bestIndex = -1;
    let bestMaxOverlap = Number.POSITIVE_INFINITY;
    let bestTotalOverlap = Number.POSITIVE_INFINITY;
    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index]!;
      const overlaps = selected.map((game) => overlap(game, candidate));
      const maxOverlap = Math.max(...overlaps);
      const totalOverlap = overlaps.reduce((sum, value) => sum + value, 0);
      if (
        maxOverlap < bestMaxOverlap
        || (maxOverlap === bestMaxOverlap && totalOverlap < bestTotalOverlap)
      ) {
        bestIndex = index;
        bestMaxOverlap = maxOverlap;
        bestTotalOverlap = totalOverlap;
      }
    }
    if (bestIndex < 0) break;
    selected.push(pool.splice(bestIndex, 1)[0]!);
  }
  if (selected.length !== options.gameCount) {
    throw new Error("Unable to select the requested portfolio size");
  }
  return selected;
}
