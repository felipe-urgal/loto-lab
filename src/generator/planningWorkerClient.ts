import { Worker } from "node:worker_threads";
import type { Contest, LotteryId } from "../domain/types.js";
import type { GenerationConstraints, GenerationPlan } from "./planning.js";

export const GENERATION_PLAN_TIMEOUT_MS = 7_500;
const MAX_CONCURRENT_PLANS = 2;
let activePlans = 0;

interface WorkerErrorPayload {
  name: string;
  message: string;
  stack?: string;
}

interface WorkerMessage {
  ok: boolean;
  result?: GenerationPlan;
  error?: WorkerErrorPayload;
}

export class GenerationPlanBusyError extends Error {
  readonly code = "GENERATION_PLAN_BUSY";

  constructor() {
    super("Generation planning is busy; retry shortly");
    this.name = "GenerationPlanBusyError";
  }
}

export class GenerationPlanTimeoutError extends Error {
  readonly code = "GENERATION_PLAN_TIMEOUT";

  constructor(readonly timeoutMs = GENERATION_PLAN_TIMEOUT_MS) {
    super(`Generation planning exceeded the ${timeoutMs}ms worker limit`);
    this.name = "GenerationPlanTimeoutError";
  }
}

export function runGenerationPlanInWorker(
  contests: Contest[],
  lottery: LotteryId,
  options: {
    targetContestNumber?: number;
    fixedNumbers?: number[];
    excludedNumbers?: number[];
    constraints?: GenerationConstraints;
  },
  timeoutMs = GENERATION_PLAN_TIMEOUT_MS,
): Promise<GenerationPlan> {
  if (activePlans >= MAX_CONCURRENT_PLANS) return Promise.reject(new GenerationPlanBusyError());
  activePlans += 1;

  return new Promise<GenerationPlan>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./planningWorker.js", import.meta.url), {
        workerData: { contests, lottery, options },
        name: `generation-plan-${lottery}`,
        resourceLimits: {
          maxOldGenerationSizeMb: 192,
          maxYoungGenerationSizeMb: 48,
        },
      });
    } catch (error) {
      activePlans = Math.max(0, activePlans - 1);
      reject(error);
      return;
    }

    let settled = false;
    let timeout: NodeJS.Timeout | undefined;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      activePlans = Math.max(0, activePlans - 1);
      callback();
    };

    timeout = setTimeout(() => {
      finish(() => {
        void worker.terminate().catch(() => undefined);
        reject(new GenerationPlanTimeoutError(timeoutMs));
      });
    }, timeoutMs);
    timeout.unref?.();

    worker.once("message", (message: WorkerMessage) => {
      finish(() => {
        if (message.ok && message.result) {
          resolve(message.result);
          return;
        }
        const payload = message.error ?? { name: "Error", message: "Generation planning worker failed" };
        const error = new Error(payload.message);
        error.name = payload.name;
        if (payload.stack) error.stack = payload.stack;
        reject(error);
      });
    });
    worker.once("messageerror", (error) => finish(() => reject(error)));
    worker.once("error", (error) => finish(() => reject(error)));
    worker.once("exit", (code) => {
      finish(() => reject(new Error(
        code === 0
          ? "Generation planning worker exited before returning a result"
          : `Generation planning worker exited with code ${code}`,
      )));
    });
  });
}
