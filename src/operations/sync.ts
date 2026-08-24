import type { Pool } from "pg";
import type { LotteryId } from "../domain/types.js";
import type { ContestSource } from "../data/source.js";
import { isLotteryAgendaSource } from "../data/source.js";
import { CaixaContestSource } from "../data/caixa.js";
import { bootstrapLotteryHistory } from "../data/bootstrap.js";
import { hasCompletePrizeSchedule } from "../finance/prizes.js";
import { PostgresAgendaRepository } from "../persistence/agendaRepository.js";
import { PostgresContestRepository } from "../persistence/contestRepository.js";
import {
  PostgresOperationRepository,
  type OperationRunRecord,
} from "../persistence/operationRepository.js";
import { NotificationService } from "../notifications/service.js";
import { RealBetService } from "../realBets/service.js";
import { logEvent } from "../observability/log.js";

const LOTTERIES: LotteryId[] = ["mega-sena", "lotofacil", "dia-de-sorte"];
const SYNC_ADVISORY_LOCK = 1515015;
const FINANCIAL_REPAIR_WINDOW = 20;

export class OperationAlreadyRunningError extends Error {
  constructor() {
    super("An operational synchronization is already running");
  }
}

export interface LotteryOperationResult {
  lottery: LotteryId;
  status: "success" | "partial" | "failed";
  latestOfficialContest?: number;
  nextContest?: number;
  nextDrawDate?: string;
  missingBefore?: number;
  fetched?: number;
  failedContests?: number;
  totalStored?: number;
  financialRefreshed?: number;
  financialRefreshFailed?: number;
  reconciledRealBets?: number;
  error?: string;
}

export interface SyncAllDetails {
  lotteries: LotteryOperationResult[];
  successfulLotteries: number;
  failedLotteries: number;
  reconciledRealBets: number;
  notificationRefresh: "success" | "failed";
  notificationError?: string;
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

async function refreshIncompleteFinancialContests(
  source: ContestSource,
  contests: PostgresContestRepository,
  lottery: LotteryId,
): Promise<{ refreshed: number; failed: number }> {
  const recent = await contests.list({ lottery, order: "desc", limit: FINANCIAL_REPAIR_WINDOW });
  const incomplete = recent.filter((contest) => !hasCompletePrizeSchedule(contest));
  if (incomplete.length === 0) return { refreshed: 0, failed: 0 };

  const settled = await Promise.allSettled(
    incomplete.map((contest) => source.fetchContest(lottery, contest.number)),
  );
  const successful = settled
    .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<ContestSource["fetchContest"]>>> => result.status === "fulfilled")
    .map((result) => result.value);
  if (successful.length > 0) await contests.upsertMany(successful);

  const failed = settled.length - successful.length;
  if (failed > 0) {
    logEvent("warn", "financial_schedule_refresh_partial", {
      lottery,
      attempted: incomplete.length,
      refreshed: successful.length,
      failed,
    });
  }
  return { refreshed: successful.length, failed };
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
  const startedAt = Date.now();

  try {
    run = await operations.create("sync-all");
    logEvent("info", "operational_sync_started", { operationRunId: run.id });
    const contests = new PostgresContestRepository(pool);
    const agenda = new PostgresAgendaRepository(pool);
    const realBets = new RealBetService(pool);
    const lotteries: LotteryOperationResult[] = [];

    for (const lottery of LOTTERIES) {
      try {
        const bootstrap = await bootstrapLotteryHistory(source, contests, lottery, {
          concurrency: options.concurrency ?? 4,
          retries: options.retries ?? 2,
          retryDelayMs: options.retryDelayMs ?? 300,
        });

        const latest = await source.fetchContest(lottery);
        await contests.upsertMany([latest]);
        const financialRepair = await refreshIncompleteFinancialContests(source, contests, lottery);

        let nextContest: number | undefined;
        let nextDrawDate: string | undefined;
        if (isLotteryAgendaSource(source)) {
          const snapshot = await source.fetchAgenda(lottery);
          await agenda.upsert(snapshot);
          nextContest = snapshot.nextContest;
          nextDrawDate = snapshot.nextDrawDate;
        }
        const reconciledRealBets = await realBets.reconcilePending(lottery);
        const partial = bootstrap.failed > 0 || financialRepair.failed > 0;

        lotteries.push({
          lottery,
          status: partial ? "partial" : "success",
          latestOfficialContest: bootstrap.latestOfficialContest,
          ...(nextContest !== undefined ? { nextContest } : {}),
          ...(nextDrawDate !== undefined ? { nextDrawDate } : {}),
          missingBefore: bootstrap.missingBefore,
          fetched: bootstrap.fetched,
          failedContests: bootstrap.failed,
          totalStored: bootstrap.totalStored,
          financialRefreshed: financialRepair.refreshed,
          financialRefreshFailed: financialRepair.failed,
          reconciledRealBets,
        });
      } catch (error) {
        lotteries.push({ lottery, status: "failed", error: message(error) });
        logEvent("error", "operational_sync_lottery_failed", {
          operationRunId: run.id,
          lottery,
          message: message(error),
        });
      }
    }

    const successfulLotteries = lotteries.filter((item) => item.status !== "failed").length;
    const failedLotteries = lotteries.length - successfulLotteries;
    const hasPartial = lotteries.some((item) => item.status === "partial");
    let status: "success" | "partial" | "failed" =
      successfulLotteries === 0 ? "failed" : failedLotteries > 0 || hasPartial ? "partial" : "success";

    let notificationRefresh: "success" | "failed" = "success";
    let notificationError: string | undefined;
    try {
      await new NotificationService(pool).refresh();
    } catch (error) {
      notificationRefresh = "failed";
      notificationError = message(error);
      if (status === "success") status = "partial";
      logEvent("error", "notification_refresh_failed", {
        operationRunId: run.id,
        message: notificationError,
      });
    }

    const details: SyncAllDetails = {
      lotteries,
      successfulLotteries,
      failedLotteries,
      reconciledRealBets: lotteries.reduce((sum, item) => sum + (item.reconciledRealBets ?? 0), 0),
      notificationRefresh,
      ...(notificationError ? { notificationError } : {}),
    };

    const finished = await operations.finish(run.id, status, details);
    logEvent(status === "failed" ? "error" : status === "partial" ? "warn" : "info", "operational_sync_completed", {
      operationRunId: run.id,
      status,
      durationMs: Date.now() - startedAt,
      successfulLotteries,
      failedLotteries,
      notificationRefresh,
    });
    return finished;
  } catch (error) {
    if (run) {
      const details: SyncAllDetails = {
        lotteries: [],
        successfulLotteries: 0,
        failedLotteries: LOTTERIES.length,
        reconciledRealBets: 0,
        notificationRefresh: "failed",
        notificationError: "Operational sync failed before notification refresh",
      };
      await operations.finish(run.id, "failed", details).catch(() => undefined);
      await new NotificationService(pool).refresh().catch((refreshError: unknown) => {
        logEvent("error", "notification_refresh_after_sync_failure_failed", {
          operationRunId: run?.id,
          message: message(refreshError),
        });
      });
      logEvent("error", "operational_sync_failed", {
        operationRunId: run.id,
        durationMs: Date.now() - startedAt,
        message: message(error),
      });
    }
    throw error;
  } finally {
    await lockClient.query("SELECT pg_advisory_unlock($1)", [SYNC_ADVISORY_LOCK]).catch(() => undefined);
    lockClient.release();
  }
}
