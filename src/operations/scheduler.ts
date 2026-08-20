import type { Pool } from "pg";
import { OperationAlreadyRunningError, runOperationalSync } from "./sync.js";

export interface OperationsSchedulerOptions {
  intervalMinutes?: number;
  runOnStart?: boolean;
  onRun?: (message: string) => void;
  onError?: (error: unknown) => void;
}

export interface OperationsScheduler {
  stop(): void;
}

function intervalMs(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 24 * 60) {
    throw new Error("OPS_INTERVAL_MINUTES must be between 5 and 1440");
  }
  return Math.round(minutes * 60_000);
}

export function startOperationsScheduler(
  pool: Pool,
  options: OperationsSchedulerOptions = {},
): OperationsScheduler {
  const delayMs = intervalMs(options.intervalMinutes ?? 30);
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const scheduleNext = (): void => {
    if (stopped) return;
    timer = setTimeout(() => void execute(), delayMs);
    timer.unref();
  };

  const execute = async (): Promise<void> => {
    if (stopped) return;
    try {
      const result = await runOperationalSync(pool);
      options.onRun?.(
        `Operational sync #${result.id}: ${result.status} (${result.details.successfulLotteries}/3 lotteries, ${result.details.reconciledRealBets} real bets reconciled)`,
      );
    } catch (error) {
      if (error instanceof OperationAlreadyRunningError) {
        options.onRun?.("Operational sync skipped because another run is active");
      } else {
        options.onError?.(error);
      }
    } finally {
      scheduleNext();
    }
  };

  if (options.runOnStart ?? true) {
    queueMicrotask(() => void execute());
  } else {
    scheduleNext();
  }

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
