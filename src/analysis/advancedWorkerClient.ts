import { Worker } from "node:worker_threads";
import type { Contest, LotteryId } from "../domain/types.js";
import type { AdvancedAnalysis } from "./advancedTypes.js";
import { ApiError } from "../api/http.js";
import { expensiveAnalysisGate } from "../api/workGate.js";

export const ADVANCED_ANALYSIS_TIMEOUT_MS = 15_000;
const MIN_ADVANCED_ANALYSIS_TIMEOUT_MS = 1_000;
const MAX_ADVANCED_ANALYSIS_TIMEOUT_MS = 10 * 60_000;

interface WorkerErrorPayload {
  name: string;
  message: string;
  code?: string;
  stack?: string;
}

interface WorkerMessage<T> {
  ok: boolean;
  result?: T;
  error?: WorkerErrorPayload;
}

export class AdvancedAnalysisTimeoutError extends Error {
  readonly code = "ADVANCED_ANALYSIS_TIMEOUT";

  constructor(readonly timeoutMs = ADVANCED_ANALYSIS_TIMEOUT_MS) {
    super(`Advanced analysis exceeded the ${timeoutMs}ms worker limit`);
    this.name = "AdvancedAnalysisTimeoutError";
  }
}

export function runAdvancedAnalysisInWorker(
  contests: Contest[],
  lottery: LotteryId,
  timeoutMs = ADVANCED_ANALYSIS_TIMEOUT_MS,
): Promise<AdvancedAnalysis> {
  return new Promise<AdvancedAnalysis>((resolve, reject) => {
    if (
      !Number.isFinite(timeoutMs)
      || timeoutMs < MIN_ADVANCED_ANALYSIS_TIMEOUT_MS
      || timeoutMs > MAX_ADVANCED_ANALYSIS_TIMEOUT_MS
    ) {
      reject(new Error("Advanced analysis worker timeout must be between 1000 and 600000 ms"));
      return;
    }

    const release = expensiveAnalysisGate.acquire();
    if (!release) {
      reject(new ApiError(429, "ANALYSIS_BUSY", "Another expensive analysis is already running"));
      return;
    }

    let worker: Worker;
    try {
      worker = new Worker(new URL("../api/analysisWorker.js", import.meta.url), {
        workerData: { kind: "advanced-analysis", contests, lottery },
        name: `analysis-${lottery}`,
        resourceLimits: {
          maxOldGenerationSizeMb: 256,
          maxYoungGenerationSizeMb: 64,
        },
      });
    } catch (error) {
      release();
      reject(error);
      return;
    }

    let settled = false;
    let timeout: NodeJS.Timeout | undefined;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      release();
      callback();
    };

    timeout = setTimeout(() => {
      finish(() => {
        // Termination is deliberately best-effort here; the caller must receive
        // a bounded failure even if the worker takes a moment to exit.
        void worker.terminate().catch(() => undefined);
        reject(new AdvancedAnalysisTimeoutError(timeoutMs));
      });
    }, timeoutMs);
    timeout.unref?.();

    worker.once("message", (message: WorkerMessage<AdvancedAnalysis>) => {
      finish(() => {
        if (message.ok && message.result !== undefined) {
          resolve(message.result);
          return;
        }
        const payload = message.error ?? { name: "Error", message: "Advanced analysis worker failed" };
        const error = new Error(payload.message) as Error & { code?: string };
        error.name = payload.name;
        if (payload.code) error.code = payload.code;
        if (payload.stack) error.stack = payload.stack;
        reject(error);
      });
    });
    worker.once("messageerror", (error) => finish(() => reject(error)));
    worker.once("error", (error) => finish(() => reject(error)));
    worker.once("exit", (code) => {
      finish(() => reject(new Error(
        code === 0
          ? "Advanced analysis worker exited before returning a result"
          : `Advanced analysis worker exited with code ${code}`,
      )));
    });
  });
}
