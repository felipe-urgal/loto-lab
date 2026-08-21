import { parentPort, workerData } from "node:worker_threads";
import type { Contest, LotteryId } from "../domain/types.js";
import { buildGenerationPlan, type GenerationConstraints } from "./planning.js";

interface GenerationPlanningWorkerInput {
  contests: Contest[];
  lottery: LotteryId;
  options: {
    targetContestNumber?: number;
    fixedNumbers?: number[];
    excludedNumbers?: number[];
    constraints?: GenerationConstraints;
  };
}

function serializeError(error: unknown) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
  };
}

const port = parentPort;
if (!port) throw new Error("Generation planning worker requires a parent port");

try {
  const input = workerData as GenerationPlanningWorkerInput;
  port.postMessage({
    ok: true,
    result: buildGenerationPlan(input.contests, input.lottery, input.options),
  });
} catch (error) {
  port.postMessage({ ok: false, error: serializeError(error) });
}
