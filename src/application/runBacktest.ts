import type { Contest, LotteryId } from "../domain/types.js";
import { backtestDiaDeSorte } from "../backtest/diaDeSorte.js";
import { backtestLotofacil } from "../backtest/lotofacil.js";
import { backtestMegaSena } from "../backtest/megaSena.js";

export const MAX_HTTP_BACKTEST_ROUNDS = 500;

export class BacktestRoundLimitError extends Error {
  constructor(readonly requested: number, readonly maximum = MAX_HTTP_BACKTEST_ROUNDS) {
    super(`Backtest would process ${requested} contests; the HTTP limit is ${maximum}`);
  }
}

export interface RunBacktestRequest {
  lottery: LotteryId;
  gameCount: number;
  warmupContests: number;
  fixedCount?: 8 | 9 | 10;
  startContest?: number;
  endContest?: number;
  persist: boolean;
}

export interface RunBacktestResponse {
  id?: number;
  lottery: LotteryId;
  options: Record<string, unknown>;
  summary: Record<string, unknown>;
  roundCount: number;
  createdAt?: string;
}

export interface ApplicationBacktestRound {
  contest: number;
  [key: string]: unknown;
}

export interface SaveApplicationBacktestInput {
  lottery: LotteryId;
  options?: Record<string, unknown>;
  summary: Record<string, unknown>;
  rounds: ApplicationBacktestRound[];
}

export interface SavedApplicationBacktestRun extends SaveApplicationBacktestInput {
  id: number;
  createdAt: string;
}

export interface BacktestHistoryReader {
  list(options: { lottery: LotteryId; order: "asc" }): Promise<Contest[]>;
}

export interface BacktestStore {
  save(input: SaveApplicationBacktestInput): Promise<SavedApplicationBacktestRun>;
}

function compactBacktestRound(round: ApplicationBacktestRound): ApplicationBacktestRound {
  const compact: ApplicationBacktestRound = { contest: round.contest };
  for (const key of ["date", "targetNumbers", "hitsByGame", "bestHits", "fixedHits"] as const) {
    if (round[key] !== undefined) compact[key] = round[key];
  }
  return compact;
}

export class RunBacktestUseCase {
  constructor(
    private readonly history: BacktestHistoryReader,
    private readonly backtests: BacktestStore,
  ) {}

  async execute(input: RunBacktestRequest): Promise<RunBacktestResponse> {
    const contests = await this.history.list({ lottery: input.lottery, order: "asc" });
    const eligibleRoundCount = contests
      .slice(input.warmupContests)
      .filter((contest) => input.startContest === undefined || contest.number >= input.startContest)
      .filter((contest) => input.endContest === undefined || contest.number <= input.endContest)
      .length;
    if (eligibleRoundCount > MAX_HTTP_BACKTEST_ROUNDS) {
      throw new BacktestRoundLimitError(eligibleRoundCount);
    }

    const options: Record<string, unknown> = {
      gameCount: input.gameCount,
      warmupContests: input.warmupContests,
      ...(input.startContest !== undefined ? { startContest: input.startContest } : {}),
      ...(input.endContest !== undefined ? { endContest: input.endContest } : {}),
    };

    let result: {
      rounds: Array<{ contest: number }>;
      summary: unknown;
    };

    if (input.lottery === "mega-sena") {
      result = backtestMegaSena(contests, {
        gameCount: input.gameCount,
        warmupContests: input.warmupContests,
        ...(input.startContest !== undefined ? { startContest: input.startContest } : {}),
        ...(input.endContest !== undefined ? { endContest: input.endContest } : {}),
      });
    } else if (input.lottery === "lotofacil") {
      const fixedCount = input.fixedCount ?? 8;
      options.fixedCount = fixedCount;
      result = backtestLotofacil(contests, {
        gameCount: input.gameCount,
        fixedCount,
        warmupContests: input.warmupContests,
        ...(input.startContest !== undefined ? { startContest: input.startContest } : {}),
        ...(input.endContest !== undefined ? { endContest: input.endContest } : {}),
      });
    } else {
      result = backtestDiaDeSorte(contests, {
        gameCount: input.gameCount,
        warmupContests: input.warmupContests,
        ...(input.startContest !== undefined ? { startContest: input.startContest } : {}),
        ...(input.endContest !== undefined ? { endContest: input.endContest } : {}),
      });
    }

    const summary = result.summary as Record<string, unknown>;
    const rounds = result.rounds as unknown as ApplicationBacktestRound[];

    if (!input.persist) {
      return {
        lottery: input.lottery,
        options,
        summary,
        roundCount: rounds.length,
      };
    }

    const saved = await this.backtests.save({
      lottery: input.lottery,
      options,
      summary,
      rounds: rounds.map(compactBacktestRound),
    });

    return {
      id: saved.id,
      lottery: saved.lottery,
      options: saved.options ?? {},
      summary: saved.summary,
      roundCount: saved.rounds.length,
      createdAt: saved.createdAt,
    };
  }
}
