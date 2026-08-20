import type { Contest, LotteryId } from "../domain/types.js";
import type { ContestSource } from "./source.js";
import { contestsForLottery, loadContests, upsertContests } from "./jsonStore.js";

export interface SyncResult {
  lottery: LotteryId;
  fetched: number;
  totalStored: number;
  firstContest?: number;
  lastContest?: number;
}

function buildResult(
  lottery: LotteryId,
  fetched: number,
  contests: Contest[],
): SyncResult {
  const scoped = contestsForLottery(contests, lottery);
  return {
    lottery,
    fetched,
    totalStored: scoped.length,
    firstContest: scoped.at(0)?.number,
    lastContest: scoped.at(-1)?.number,
  };
}

export async function syncContestRange(
  path: string,
  source: ContestSource,
  lottery: LotteryId,
  startContest: number,
  endContest: number,
): Promise<SyncResult> {
  const fetched = await source.fetchContestRange(lottery, startContest, endContest);
  const all = await upsertContests(path, fetched);
  return buildResult(lottery, fetched.length, all);
}

export async function syncLatestContest(
  path: string,
  source: ContestSource,
  lottery: LotteryId,
): Promise<SyncResult> {
  const latest = await source.fetchContest(lottery);
  const all = await upsertContests(path, [latest]);
  return buildResult(lottery, 1, all);
}

export async function missingContestNumbers(
  path: string,
  lottery: LotteryId,
  startContest: number,
  endContest: number,
): Promise<number[]> {
  if (
    !Number.isInteger(startContest) ||
    !Number.isInteger(endContest) ||
    startContest < 1 ||
    endContest < startContest
  ) {
    throw new Error("Invalid contest range");
  }

  const stored = contestsForLottery(await loadContests(path), lottery);
  const known = new Set(stored.map((contest) => contest.number));
  const missing: number[] = [];

  for (let contest = startContest; contest <= endContest; contest += 1) {
    if (!known.has(contest)) missing.push(contest);
  }

  return missing;
}

export async function syncMissingContests(
  path: string,
  source: ContestSource,
  lottery: LotteryId,
  startContest: number,
  endContest: number,
): Promise<SyncResult> {
  const missing = await missingContestNumbers(path, lottery, startContest, endContest);
  const fetched: Contest[] = [];

  for (const contestNumber of missing) {
    fetched.push(await source.fetchContest(lottery, contestNumber));
  }

  const all =
    fetched.length > 0
      ? await upsertContests(path, fetched)
      : await loadContests(path);

  return buildResult(lottery, fetched.length, all);
}
