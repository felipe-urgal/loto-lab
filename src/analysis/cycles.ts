import type { Contest, LotteryConfig } from "../domain/types.js";
import { splitContinuousSegments } from "./continuity.js";
import { numberRange } from "./frequency.js";
import { summarize } from "./statistics.js";

export function buildCycles(contests: Contest[], config: LotteryConfig) {
  const universe = numberRange(config);
  const completedLengths: number[] = [];
  const segments = splitContinuousSegments(contests);
  let current = {
    available: contests.length > 0,
    currentLength: 0 as number | null,
    seen: 0 as number | null,
    missing: [...universe],
  };

  segments.forEach((segment, segmentIndex) => {
    const seen = new Set<number>();
    let currentLength = 0;
    let currentKnown = segmentIndex === 0 && contests[0]?.number === 1;
    for (const contest of segment) {
      currentLength += 1;
      for (const number of contest.numbers) seen.add(number);
      if (seen.size === universe.length) {
        if (currentKnown) completedLengths.push(currentLength);
        seen.clear();
        currentLength = 0;
        currentKnown = true;
      }
    }
    if (segmentIndex === segments.length - 1) {
      current = currentKnown
        ? {
            available: true,
            currentLength,
            seen: seen.size,
            missing: universe.filter((number) => !seen.has(number)),
          }
        : {
            available: false,
            currentLength: null,
            seen: null,
            missing: [],
          };
    }
  });

  return {
    ...current,
    completedCount: completedLengths.length,
    historicalLength: summarize(completedLengths),
  };
}
