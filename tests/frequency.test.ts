import test from "node:test";
import assert from "node:assert/strict";
import { calculateFrequency } from "../src/analysis/frequency.js";
import { getLotteryConfig } from "../src/lotteries/config.js";
import type { Contest } from "../src/domain/types.js";

const config = getLotteryConfig("mega-sena");

const contests: Contest[] = [
  { lottery: "mega-sena", number: 1, date: "2026-01-01", numbers: [1, 2, 3, 4, 5, 6] },
  { lottery: "mega-sena", number: 2, date: "2026-01-03", numbers: [1, 7, 8, 9, 10, 11] },
];

test("calculateFrequency counts appearances and rates", () => {
  const result = calculateFrequency(contests, config);
  const one = result.find((item) => item.number === 1);
  const two = result.find((item) => item.number === 2);
  const sixty = result.find((item) => item.number === 60);

  assert.deepEqual(one, { number: 1, count: 2, rate: 1 });
  assert.deepEqual(two, { number: 2, count: 1, rate: 0.5 });
  assert.deepEqual(sixty, { number: 60, count: 0, rate: 0 });
});

test("calculateFrequency rejects invalid contests", () => {
  const invalid: Contest[] = [
    { lottery: "mega-sena", number: 3, date: "2026-01-05", numbers: [1, 1, 2, 3, 4, 5] },
  ];

  assert.throws(() => calculateFrequency(invalid, config), /duplicated numbers/);
});
