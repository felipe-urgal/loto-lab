import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Contest, LotteryId } from "../domain/types.js";

function keyOf(contest: Contest): string {
  return `${contest.lottery}:${contest.number}`;
}

export function mergeContests(existing: Contest[], incoming: Contest[]): Contest[] {
  const byKey = new Map<string, Contest>();
  for (const contest of existing) byKey.set(keyOf(contest), contest);
  for (const contest of incoming) byKey.set(keyOf(contest), contest);

  return [...byKey.values()].sort(
    (a, b) => a.lottery.localeCompare(b.lottery) || a.number - b.number,
  );
}

export async function loadContests(path: string): Promise<Contest[]> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Contest file must contain an array");
    return parsed as Contest[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function saveContests(path: string, contests: Contest[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const normalized = mergeContests([], contests);
  await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

export async function upsertContests(path: string, contests: Contest[]): Promise<Contest[]> {
  const existing = await loadContests(path);
  const merged = mergeContests(existing, contests);
  await saveContests(path, merged);
  return merged;
}

export function contestsForLottery(contests: Contest[], lottery: LotteryId): Contest[] {
  return contests
    .filter((contest) => contest.lottery === lottery)
    .sort((a, b) => a.number - b.number);
}
