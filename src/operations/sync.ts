import type { Pool } from "pg";
import type { LotteryId } from "../domain/types.js";
import type { ContestSource } from "../data/source.js";
import { CaixaContestSource } from "../data/caixa.js";
import { bootstrapLotteryHistory } from "../data/bootstrap.js";
import { PostgresContestRepository } from "../persistence/contestRepository.js";
import {
  PostgresOperationRepository,
  type OperationRunRecord,
  type OperationStatus,
} from "../persistence/operationRepository.js";
import { RealBetService } from "../realBets/service.js";

const LOTTERIES: LotteryId[] = ["mega-sena", "lotofacil", "dia-de-sorte"];
const SYNC_ADVISORY_LOCK = 1515015;

export class OperationAlreadyRunningError extends Error {
  constructor() {
    super("An operational synchronization is already running");
  }
}

export interface LotteryOperationResult {
  lottery: LotteryId;
  status: "success" | "partial" | "failed";
  latestOfficialContest?: number;
  missingBefore?: number;
  fetched?: number;
  failedContests?: number;
  totalStored?: number;
  reconciledRealBets?: number;
  error?: string;
}

export interface SyncAllDetails {
  lotteries: LotteryOperationResult[];
  successfulLotteries: number;
  failedLotteries: number;
  reconciledRealBets: number;
}

export interface RunOperationalSyncOptions {
  source?: ContestSource;
  concurrency?: number;
  retries?: number;
  retryDelayMs?: number;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runOperationalSync(
  pool: Pool,
  options: RunOperationalSyncOptions = {},
): Promise<OperationRunRecord<SyncAllDetails>> {
  const lockClient = await pool.connect();
  const lock = await lockClient.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock($1) AS locked",
    [SYNC_ADVISORY_LOCK],
  );

  if (!lock.rows[0]?.locked) {
    lockClient.release();
    throw new OperationAlreadyRunningError();
  }

  const operations = new PostgresOperationRepository(pool);
  const source = options.source ?? new CaixaContestSource();
  let run: OperationRunRecord<Record<string, never>> | undefined;

  try {
    run = await operations.create("sync-all");
    const contests = new PostgresContestRepository(pool);
    const realBets = new RealBetService(pool);
    const lotteries: LotteryOperationResult[] = [];

    for (const lottery of LOTTERIES) {
      try {
        const bootstrap = await bootstrapLotteryHistory(source, contests, lottery, {
          concurrency: options.concurrency ?? 4,
          retries: options.retries ?? 2,
          retryDelayMs: options.retryDelayMs ?? 300,
        });

        // Refresh the current contest even when it already exists so late rateio
        // updates from Caixa are persisted without requiring a full bootstrap.
        const latest = await source.fetchContest(lottery);
        await contests.upsertMany([latest]);
        const reconciledRealBets = await realBets.reconcilePending(lottery);

        lotteries.push({
          lottery,
          status: bootstrap.failed > 0 ? "partial" : "success",
          latestOfficialContest: bootstrap.latestOfficialContest,
          missingBefore: bootstrap.missingBefore,
          fetched: bootstrap.fetched,
          failedContests: bootstrap.failed,
          totalStored: bootstrap.totalStored,
          reconciledRealBets,
        });
      } catch (error) {
        lotteries.push({ lottery, status: "failed", error: message(error) });
      }
    }

    const successfulLotteries = lotteries.filter((item) => item.status !== "failed").length;
    const failedLotteries = lotteries.length - successfulLotteries;
    const hasPartial = lotteries.some((item) => item.status === "partial");
    const status: Exclude<OperationStatus, "running"> =
      successfulLotteries === 0 ? "failed" : failedLotteries > 0 || hasPartial ? "partial" : "success";
    const details: SyncAllDetails = {
      lotteries,
      successfulLotteries,
      failedLotteries,
      reconciledRealBets: lotteries.reduce((sum, item) => sum + (item.reconciledRealBets ?? 0), 0),
    };

    return await operations.finish(run.id, status, details);
  } catch (error) {
    if (run) {
      const details: SyncAllDetails = {
        lotteries: [],
        successfulLotteries: 0,
        failedLotteries: LOTTERIES.length,
        reconciledRealBets: 0,
      };
      await operations.finish(run.id, "failed", details).catch(() => undefined);
    }
    throw error;
  } finally {
    await lockClient.query("SELECT pg_advisory_unlock($1)", [SYNC_ADVISORY_LOCK]).catch(() => undefined);
    lockClient.release();
  }
}
