import type { Contest } from "../domain/types.js";

export interface EligibleTargetOptions {
  warmupContests: number;
  startContest?: number;
  endContest?: number;
  maxRounds?: number;
}

/**
 * A historical validation target is eligible only when its immediate predecessor
 * exists in the dataset. This prevents repetition/recent-window logic from
 * silently treating an older contest as "the previous draw" across a gap.
 */
export function hasImmediatePredecessor(contests: Contest[], index: number): boolean {
  if (index <= 0 || index >= contests.length) return false;
  return contests[index - 1]!.number === contests[index]!.number - 1;
}

/**
 * Returns only the latest contiguous suffix of a contest series. Recent windows
 * must not silently jump across a missing contest: when continuity restarts, the
 * available recent sample simply becomes smaller until enough draws accumulate.
 */
export function continuousSuffix(contests: Contest[]): Contest[] {
  if (contests.length <= 1) return [...contests];
  let start = contests.length - 1;
  while (start > 0 && contests[start - 1]!.number === contests[start]!.number - 1) {
    start -= 1;
  }
  return contests.slice(start);
}

export function eligibleTargetIndexes(
  contests: Contest[],
  options: EligibleTargetOptions,
): number[] {
  const indexes: number[] = [];
  const startIndex = Math.max(1, Math.round(options.warmupContests));

  for (let index = startIndex; index < contests.length; index += 1) {
    const target = contests[index]!;
    if (options.startContest !== undefined && target.number < options.startContest) continue;
    if (options.endContest !== undefined && target.number > options.endContest) continue;
    if (!hasImmediatePredecessor(contests, index)) continue;
    indexes.push(index);
  }

  const maxRounds = options.maxRounds;
  if (maxRounds === undefined || maxRounds <= 0 || indexes.length <= maxRounds) return indexes;
  return indexes.slice(-Math.round(maxRounds));
}
