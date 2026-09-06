import type { Contest } from "../domain/types.js";

export interface AnalysisDataQuality {
  continuous: boolean;
  missingContestCount: number;
  gaps: Array<{ after: number; before: number; missing: number }>;
  latestContinuousContests: number;
}

export function isConsecutive(
  previous: Contest | undefined,
  current: Contest | undefined,
): boolean {
  return Boolean(previous && current && current.number === previous.number + 1);
}

export function splitContinuousSegments(contests: Contest[]): Contest[][] {
  if (contests.length === 0) return [];
  const segments: Contest[][] = [[contests[0]!]];
  for (let index = 1; index < contests.length; index += 1) {
    const contest = contests[index]!;
    const previous = contests[index - 1]!;
    if (isConsecutive(previous, contest)) segments.at(-1)!.push(contest);
    else segments.push([contest]);
  }
  return segments;
}

export function latestContinuousSegment(contests: Contest[]): Contest[] {
  return splitContinuousSegments(contests).at(-1) ?? [];
}

export function buildDataQuality(contests: Contest[]): AnalysisDataQuality {
  const gaps: AnalysisDataQuality["gaps"] = [];
  let missingContestCount = 0;
  for (let index = 1; index < contests.length; index += 1) {
    const previous = contests[index - 1]!;
    const current = contests[index]!;
    const missing = Math.max(0, current.number - previous.number - 1);
    if (missing > 0) {
      gaps.push({ after: previous.number, before: current.number, missing });
      missingContestCount += missing;
    }
  }
  return {
    continuous: gaps.length === 0,
    missingContestCount,
    gaps: gaps.slice(-20),
    latestContinuousContests: latestContinuousSegment(contests).length,
  };
}
