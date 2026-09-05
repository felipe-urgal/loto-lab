import type { LotteryId } from "../domain/types.js";
import { getLotteryConfig } from "../lotteries/config.js";
import type { GenerationConstraints, GenerationRange } from "./planningSpace.js";

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function assertRange(name: string, value: GenerationRange | undefined, minimum: number, maximum: number): void {
  if (!value) return;
  if (
    !Number.isInteger(value.min) ||
    !Number.isInteger(value.max) ||
    value.min < minimum ||
    value.max > maximum ||
    value.min > value.max
  ) {
    throw new Error(`${name} must be an integer range between ${minimum} and ${maximum}`);
  }
}

export function validateGenerationSelection(
  lottery: LotteryId,
  fixedNumbers: number[],
  excludedNumbers: number[],
): { fixed: number[]; excluded: number[] } {
  const config = getLotteryConfig(lottery);
  const fixed = uniqueSorted(fixedNumbers);
  const excluded = uniqueSorted(excludedNumbers);
  const inRange = (value: number) => Number.isInteger(value) && value >= config.minNumber && value <= config.maxNumber;

  if (!fixed.every(inRange) || !excluded.every(inRange)) {
    throw new Error(`Selected numbers must be between ${config.minNumber} and ${config.maxNumber}`);
  }
  if (fixed.length !== fixedNumbers.length || excluded.length !== excludedNumbers.length) {
    throw new Error("Selected numbers must not contain duplicates");
  }
  if (fixed.length > config.drawSize) {
    throw new Error(`At most ${config.drawSize} numbers can be fixed`);
  }
  if (fixed.some((value) => excluded.includes(value))) {
    throw new Error("A number cannot be fixed and excluded at the same time");
  }
  if (config.maxNumber - config.minNumber + 1 - excluded.length < config.drawSize) {
    throw new Error("Too many numbers were excluded to form a valid game");
  }

  return { fixed, excluded };
}

export function validateGenerationConstraints(
  lottery: LotteryId,
  constraints: GenerationConstraints,
): void {
  const config = getLotteryConfig(lottery);
  assertRange("odd", constraints.odd, 0, config.drawSize);
  assertRange("repeated", constraints.repeated, 0, config.drawSize);

  const universe = Array.from(
    { length: config.maxNumber - config.minNumber + 1 },
    (_, index) => config.minNumber + index,
  );
  const minimumSum = universe.slice(0, config.drawSize).reduce((total, value) => total + value, 0);
  const maximumSum = universe.slice(-config.drawSize).reduce((total, value) => total + value, 0);
  assertRange("sum", constraints.sum, minimumSum, maximumSum);
}
