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
  stopAndDrain(): Promise<void>;
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
  let inFlight: Promise<void> | undefined;

  const scheduleNext = (): void => {
    if (stopped) return;
    timer = setTimeout(() => void execute(), delayMs);
    timer.unref();
  };

  const execute = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (inFlight) return inFlight;

    const run = (async (): Promise<void> => {
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
        inFlight = undefined;
        scheduleNext();
      }
    })();

    inFlight = run;
    return run;
  };

  const stop = (): void => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  if (options.runOnStart ?? true) {
    queueMicrotask(() => void execute());
  } else {
    scheduleNext();
  }

  return {
    stop,
    async stopAndDrain() {
      stop();
      await inFlight;
    },
  };
}
