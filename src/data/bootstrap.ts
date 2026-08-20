import type { Contest, LotteryId } from "../domain/types.js";
import type { ContestSource } from "./source.js";

export interface ContestBootstrapStore {
  listContestNumbers(
    lottery: LotteryId,
    startContest: number,
    endContest: number,
  ): Promise<number[]>;
  upsertMany(contests: Contest[]): Promise<void>;
}

export interface BootstrapProgress {
  lottery: LotteryId;
  latestOfficialContest: number;
  totalMissing: number;
  processed: number;
  fetched: number;
  failed: number;
}

export interface BootstrapFailure {
  contest: number;
  message: string;
}

export interface BootstrapResult {
  lottery: LotteryId;
  latestOfficialContest: number;
  existingBefore: number;
  missingBefore: number;
  fetched: number;
  failed: number;
  totalStored: number;
  failures: BootstrapFailure[];
}

export interface BootstrapOptions {
  concurrency?: number;
  retries?: number;
  retryDelayMs?: number;
  onProgress?: (progress: BootstrapProgress) => void;
}

function positiveInt(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  operation: () => Promise<T>,
  retries: number,
  retryDelayMs: number,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await delay(retryDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function bootstrapLotteryHistory(
  source: ContestSource,
  store: ContestBootstrapStore,
  lottery: LotteryId,
  options: BootstrapOptions = {},
): Promise<BootstrapResult> {
  const concurrency = positiveInt(options.concurrency ?? 4, "concurrency");
  const retries = options.retries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 250;

  if (!Number.isInteger(retries) || retries < 0) {
    throw new Error("retries must be a non-negative integer");
  }
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) {
    throw new Error("retryDelayMs must be a non-negative number");
  }

  const latest = await withRetry(
    () => source.fetchContest(lottery),
    retries,
    retryDelayMs,
  );
  const latestOfficialContest = latest.number;
  const existing = await store.listContestNumbers(lottery, 1, latestOfficialContest);
  const existingSet = new Set(existing);
  const missing: number[] = [];

  for (let contest = 1; contest <= latestOfficialContest; contest += 1) {
    if (!existingSet.has(contest)) missing.push(contest);
  }

  let processed = 0;
  let fetched = 0;
  const failures: BootstrapFailure[] = [];

  for (const wave of chunks(missing, concurrency)) {
    const settled = await Promise.allSettled(
      wave.map((contestNumber) =>
        withRetry(
          () => source.fetchContest(lottery, contestNumber),
          retries,
          retryDelayMs,
        ),
      ),
    );

    const successful: Contest[] = [];
    settled.forEach((result, index) => {
      const contestNumber = wave[index]!;
      if (result.status === "fulfilled") {
        successful.push(result.value);
      } else {
        failures.push({
          contest: contestNumber,
          message: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });

    if (successful.length > 0) {
      await store.upsertMany(successful);
      fetched += successful.length;
    }

    processed += wave.length;
    options.onProgress?.({
      lottery,
      latestOfficialContest,
      totalMissing: missing.length,
      processed,
      fetched,
      failed: failures.length,
    });
  }

  const after = await store.listContestNumbers(lottery, 1, latestOfficialContest);

  return {
    lottery,
    latestOfficialContest,
    existingBefore: existing.length,
    missingBefore: missing.length,
    fetched,
    failed: failures.length,
    totalStored: after.length,
    failures,
  };
}
