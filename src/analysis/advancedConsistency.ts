import type { Contest, LotteryConfig } from "../domain/types.js";
import type { buildAdvancedAnalysis } from "./advanced.js";
import { continuousSuffix } from "./contestEligibility.js";
import { calculateFrequency, type FrequencyResult } from "./frequency.js";

type AdvancedAnalysis = ReturnType<typeof buildAdvancedAnalysis>;

function frequencyMap(contests: Contest[], config: LotteryConfig): Map<number, FrequencyResult> {
  return new Map(calculateFrequency(contests, config).map((item) => [item.number, item]));
}

/**
 * Keeps the explanatory recent-frequency payload on the same continuous draw
 * suffix used by score-v2. A missing contest must shrink the recent sample;
 * silently crossing a gap would make the explanation disagree with the model.
 */
export function alignRecentFrequencyWindows(
  analysis: AdvancedAnalysis,
  contests: Contest[],
  config: LotteryConfig,
): AdvancedAnalysis {
  const scoped = contests
    .filter((contest) => contest.lottery === config.id)
    .sort((a, b) => a.number - b.number);
  const recent = continuousSuffix(scoped);
  const recent10 = frequencyMap(recent.slice(-10), config);
  const recent20 = frequencyMap(recent.slice(-20), config);

  for (const item of analysis.ranking.dynamics.items) {
    item.frequency.recent10 = recent10.get(item.number) ?? { number: item.number, count: 0, rate: 0 };
    item.frequency.recent20 = recent20.get(item.number) ?? { number: item.number, count: 0, rate: 0 };
  }

  return analysis;
}
