import type { Contest, GeneratedGame } from "../domain/types.js";
import { getLotteryConfig } from "../lotteries/config.js";
import { matchesGenerationConstraints, type GenerationConstraints } from "./planning.js";
import { buildMetadata, createSeededRandom } from "./shared.js";
import { DIA_DE_SORTE_MODEL, evaluateDiaDeSorteTicket } from "./diaDeSorteModel.js";

const config = getLotteryConfig("dia-de-sorte");
const LUCKY_MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;
const POOL_SIZE = 8_000;
const GUIDE_SHARPNESS = 10;
const INITIAL_OVERLAP_CAP = 3;

export interface DiaDeSortePayoutOptions {
  gameCount: number;
  fixedCount: number;
  seed: string;
  fixedNumbers?: number[];
  excludedNumbers?: number[];
  constraints?: GenerationConstraints;
  referenceContest?: Contest;
}

export interface DiaDeSortePayoutReport {
  strategy: "dia-de-sorte-payout-v1";
  model: string;
  fitThroughContest: number;
  /** Retorno esperado relativo a um jogo uniforme (1,00) por jogo. */
  evIndex: number[];
  averageEvIndex: number;
  /** Índice de ganhadores no jogo exato (7 acertos) por jogo (1,00 = uniforme). */
  jackpotShareIndex: number[];
  maxPairOverlap: number;
  poolSize: number;
}

function sampleGuided(allowed: number[], count: number, random: () => number): number[] {
  const pool = allowed.map((number) => ({ number, weight: Math.exp(-GUIDE_SHARPNESS * DIA_DE_SORTE_MODEL.popularity[number - 1]!) }));
  const picked: number[] = [];
  for (let step = 0; step < count; step += 1) {
    const total = pool.reduce((sum, item) => sum + item.weight, 0);
    let cursor = random() * total;
    let index = 0;
    for (; index < pool.length - 1; index += 1) {
      cursor -= pool[index]!.weight;
      if (cursor < 0) break;
    }
    picked.push(pool.splice(index, 1)[0]!.number);
  }
  return picked;
}

function overlapOf(left: number[], right: number[]): number {
  return left.filter((number) => right.includes(number)).length;
}

export function generateDiaDeSortePayoutGames(options: DiaDeSortePayoutOptions): {
  games: GeneratedGame[];
  report: DiaDeSortePayoutReport;
} {
  const fixed = [...(options.fixedNumbers ?? [])];
  const excluded = new Set(options.excludedNumbers ?? []);
  const universe = Array.from({ length: config.maxNumber - config.minNumber + 1 }, (_, index) => config.minNumber + index);
  if (!Number.isInteger(options.gameCount) || options.gameCount < 1) throw new Error("gameCount must be a positive integer");
  if (!Number.isInteger(options.fixedCount) || options.fixedCount < 0 || options.fixedCount > config.drawSize) {
    throw new Error("fixedCount must fit inside the bet size");
  }
  if (fixed.length > options.fixedCount) throw new Error("Manual fixed numbers exceed the configured fixed core");
  if (new Set(fixed).size !== fixed.length) throw new Error("Fixed numbers must be unique");
  if (fixed.some((number) => !universe.includes(number)) || [...excluded].some((number) => !universe.includes(number))) {
    throw new Error("Fixed or excluded number is outside the lottery universe");
  }
  if (fixed.some((number) => excluded.has(number))) throw new Error("A number cannot be fixed and excluded at the same time");

  const random = createSeededRandom(`dia-de-sorte-payout:${options.seed}`);
  const open = universe.filter((number) => !excluded.has(number) && !fixed.includes(number));
  if (open.length < config.drawSize - fixed.length) throw new Error("Too many excluded numbers for the requested bet size");
  const core = [...fixed, ...sampleGuided(open, options.fixedCount - fixed.length, random)].sort((a, b) => a - b);
  const variablePool = open.filter((number) => !core.includes(number));
  const variableCount = config.drawSize - core.length;

  const seen = new Set<string>();
  const pool: { numbers: number[]; variable: number[]; ev: number }[] = [];
  for (let attempt = 0; pool.length < POOL_SIZE && attempt < POOL_SIZE * 4; attempt += 1) {
    const variable = sampleGuided(variablePool, variableCount, random).sort((a, b) => a - b);
    const numbers = [...core, ...variable].sort((a, b) => a - b);
    const key = numbers.join("-");
    if (seen.has(key)) continue;
    seen.add(key);
    const game: GeneratedGame = {
      lottery: "dia-de-sorte",
      numbers,
      fixedNumbers: core,
      variableNumbers: variable,
      metadata: buildMetadata(numbers, options.referenceContest, false),
    };
    if (!matchesGenerationConstraints(game, options.constraints)) continue;
    pool.push({ numbers, variable, ev: evaluateDiaDeSorteTicket(numbers).evIndex });
  }
  if (pool.length < options.gameCount) throw new Error("Unable to sample enough unique games with the requested constraints");
  pool.sort((a, b) => b.ev - a.ev || a.numbers.join("-").localeCompare(b.numbers.join("-")));

  // O EV é aditivo entre jogos; limitar a sobreposição reduz a variância e evita pagar duas vezes pelas mesmas faixas.
  const selected: typeof pool = [];
  let cap = Math.max(INITIAL_OVERLAP_CAP, core.length);
  while (selected.length < options.gameCount) {
    const next = pool.find((candidate) =>
      !selected.includes(candidate) && selected.every((game) => overlapOf(game.numbers, candidate.numbers) <= cap));
    if (next) selected.push(next);
    else if (cap < config.drawSize - 1) cap += 1;
    else throw new Error("Unable to build a low-overlap portfolio with the requested constraints");
  }

  // O Mês da Sorte é uniforme e tem prêmio fixo: meses distintos entre os jogos só reduzem a variância.
  const months = [...LUCKY_MONTHS];
  for (let index = months.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    [months[index], months[pick]] = [months[pick]!, months[index]!];
  }
  const games: GeneratedGame[] = selected.map((entry, index) => {
    const luckyMonth = months[index % months.length]!;
    return {
      lottery: "dia-de-sorte",
      numbers: entry.numbers,
      fixedNumbers: [...core],
      variableNumbers: entry.variable,
      luckyMonth,
      secondary: { kind: "lucky-month", values: [luckyMonth] },
      metadata: buildMetadata(entry.numbers, options.referenceContest, false),
    };
  });
  let maxPairOverlap = 0;
  for (let left = 0; left < selected.length; left += 1) {
    for (let right = left + 1; right < selected.length; right += 1) {
      maxPairOverlap = Math.max(maxPairOverlap, overlapOf(selected[left]!.numbers, selected[right]!.numbers));
    }
  }
  const evaluations = selected.map((entry) => evaluateDiaDeSorteTicket(entry.numbers));
  const round = (value: number) => Number(value.toFixed(3));
  const evIndex = evaluations.map((entry) => round(entry.evIndex));
  return {
    games,
    report: {
      strategy: "dia-de-sorte-payout-v1",
      model: DIA_DE_SORTE_MODEL.id,
      fitThroughContest: DIA_DE_SORTE_MODEL.fitThroughContest,
      evIndex,
      averageEvIndex: round(evIndex.reduce((sum, value) => sum + value, 0) / evIndex.length),
      jackpotShareIndex: evaluations.map((entry) => round(entry.shareIndex[7])),
      maxPairOverlap,
      poolSize: pool.length,
    },
  };
}
