import type { AnalysisModel, Contest, GeneratedGame } from "../domain/types.js";
import { eligibleTargetIndexes } from "../analysis/contestEligibility.js";
import { evaluateGames, type GameCheckResult } from "../checker/evaluate.js";
import {
  generateDiaDeSorteGames,
  type DiaDeSorteFixedCount,
} from "../generator/diaDeSorte.js";
import { summarizeBacktestRounds, type BacktestSummary } from "./shared.js";

export interface DiaDeSorteBacktestOptions {
  gameCount?: number;
  fixedCount?: DiaDeSorteFixedCount;
  warmupContests?: number;
  startContest?: number;
  endContest?: number;
  analysisModel?: AnalysisModel;
}

export interface DiaDeSorteBacktestRound {
  contest: number;
  date: string;
  targetNumbers: number[];
  targetLuckyMonth?: string;
  generatedGames: GeneratedGame[];
  checks: GameCheckResult[];
  bestHits: number;
  fixedHits: number;
  luckyMonthHits: number;
}

export interface DiaDeSorteBacktestResult {
  rounds: DiaDeSorteBacktestRound[];
  summary: BacktestSummary & {
    luckyMonthHits: number;
    luckyMonthRate: number;
  };
  strategy: {
    gameCount: number;
    fixedCount: DiaDeSorteFixedCount;
    warmupContests: number;
    analysisModel: AnalysisModel;
  };
}

export function backtestDiaDeSorte(
  contests: Contest[],
  options: DiaDeSorteBacktestOptions = {},
): DiaDeSorteBacktestResult {
  const gameCount = options.gameCount ?? 4;
  const fixedCount = options.fixedCount ?? 3;
  const warmupContests = options.warmupContests ?? 20;
  const analysisModel = options.analysisModel ?? "score-v2";

  if (!Number.isInteger(gameCount) || gameCount < 1) throw new Error("gameCount must be a positive integer");
  if (![0, 2, 3].includes(fixedCount)) throw new Error("Dia de Sorte fixedCount must be 0, 2 or 3");
  if (!Number.isInteger(warmupContests) || warmupContests < 1) throw new Error("warmupContests must be a positive integer");

  const scoped = contests
    .filter((contest) => contest.lottery === "dia-de-sorte")
    .sort((a, b) => a.number - b.number);
  const rounds: DiaDeSorteBacktestRound[] = [];
  const targetIndexes = eligibleTargetIndexes(scoped, {
    warmupContests,
    ...(options.startContest !== undefined ? { startContest: options.startContest } : {}),
    ...(options.endContest !== undefined ? { endContest: options.endContest } : {}),
  });

  for (const index of targetIndexes) {
    const target = scoped[index]!;
    const history = scoped.slice(0, index);
    const generatedGames = generateDiaDeSorteGames(history, { gameCount, fixedCount, analysisModel });
    const checks = evaluateGames(generatedGames, target);
    const luckyMonthHits = checks.filter((check) => check.luckyMonthHit).length;
    rounds.push({
      contest: target.number,
      date: target.date,
      targetNumbers: [...target.numbers],
      ...(target.luckyMonth ? { targetLuckyMonth: target.luckyMonth } : {}),
      generatedGames,
      checks,
      bestHits: Math.max(...checks.map((check) => check.hits)),
      fixedHits: checks[0]?.fixedHits ?? 0,
      luckyMonthHits,
    });
  }

  const baseSummary = summarizeBacktestRounds(rounds);
  const luckyMonthHits = rounds.reduce((total, round) => total + round.luckyMonthHits, 0);
  return {
    rounds,
    summary: {
      ...baseSummary,
      luckyMonthHits,
      luckyMonthRate: baseSummary.totalGames === 0 ? 0 : luckyMonthHits / baseSummary.totalGames,
    },
    strategy: { gameCount, fixedCount, warmupContests, analysisModel },
  };
}
