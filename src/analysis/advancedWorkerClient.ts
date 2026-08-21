import { Worker } from "node:worker_threads";
import type { Contest, LotteryId } from "../domain/types.js";
import type { AdvancedAnalysis } from "../api/services.js";

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

export function runAdvancedAnalysisInWorker(
  contests: Contest[],
  lottery: LotteryId,
): Promise<AdvancedAnalysis> {
  return new Promise<AdvancedAnalysis>((resolve, reject) => {
    const worker = new Worker(new URL("../api/analysisWorker.js", import.meta.url), {
      workerData: { kind: "advanced-analysis", contests, lottery },
    });
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };

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
