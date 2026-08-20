import type { Contest, LotteryConfig } from "../domain/types.js";

export interface FrequencyResult {
  number: number;
  count: number;
  rate: number;
}

export function numberRange(config: LotteryConfig): number[] {
  return Array.from(
    { length: config.maxNumber - config.minNumber + 1 },
    (_, index) => config.minNumber + index,
  );
}

export function validateContest(contest: Contest, config: LotteryConfig): void {
  if (contest.lottery !== config.id) {
    throw new Error(`Contest ${contest.number} belongs to ${contest.lottery}, expected ${config.id}`);
  }

  if (contest.numbers.length !== config.drawSize) {
    throw new Error(
      `Contest ${contest.number} has ${contest.numbers.length} numbers, expected ${config.drawSize}`,
    );
  }

  const unique = new Set(contest.numbers);
  if (unique.size !== contest.numbers.length) {
    throw new Error(`Contest ${contest.number} contains duplicated numbers`);
  }

  for (const number of contest.numbers) {
    if (number < config.minNumber || number > config.maxNumber) {
      throw new Error(`Contest ${contest.number} contains out-of-range number ${number}`);
    }
  }
}

export function calculateFrequency(
  contests: Contest[],
  config: LotteryConfig,
): FrequencyResult[] {
  const counts = new Map<number, number>(numberRange(config).map((number) => [number, 0]));

  for (const contest of contests) {
    validateContest(contest, config);
    for (const number of contest.numbers) {
      counts.set(number, (counts.get(number) ?? 0) + 1);
    }
  }

  return numberRange(config).map((number) => {
    const count = counts.get(number) ?? 0;
    return {
      number,
      count,
      rate: contests.length === 0 ? 0 : count / contests.length,
    };
  });
}
