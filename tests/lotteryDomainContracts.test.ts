import test from "node:test";
import assert from "node:assert/strict";
import { LOTTERY_CATALOG, isSupportedLotteryId } from "../src/domain/lotteryCatalog.js";
import { OFFICIAL_BET_RULES, combinationCount, quoteOfficialBet } from "../src/domain/betRules.js";
import { quoteMaisMilionaria, quoteSuperSete, quoteTimemania } from "../src/domain/structuredBetRules.js";
import { LOTTERY_CONFIGS } from "../src/lotteries/config.js";
import { assertValidGeneratedGame } from "../src/domain/validation.js";
import type { LotteryId } from "../src/domain/types.js";

test("catalog announces only executable numeric bet-size variability", () => {
  const fixed = new Set(["dia-de-sorte", "lotomania", "timemania"]);
  for (const [id, product] of Object.entries(LOTTERY_CATALOG)) {
    if (!isSupportedLotteryId(id as keyof typeof LOTTERY_CATALOG)) continue;
    const lottery = id as LotteryId;
    const config = LOTTERY_CONFIGS[lottery];
    const official = OFFICIAL_BET_RULES[lottery as keyof typeof OFFICIAL_BET_RULES];
    const variable = lottery === "mais-milionaria" || lottery === "super-sete"
      || (official !== undefined && official.minBetSize < official.maxBetSize);
    assert.equal(product.capabilities.variableBetSize, variable, lottery);
    if (fixed.has(lottery)) assert.equal(product.capabilities.variableBetSize, false);
    assert.equal(config.id, lottery);
  }
});

test("official bet rules match generator configs and executable validator bounds", () => {
  for (const rule of Object.values(OFFICIAL_BET_RULES)) {
    const config = LOTTERY_CONFIGS[rule.product as LotteryId];
    assert.ok(config, rule.product);
    assert.equal(config.maxNumber - config.minNumber + 1, rule.universeSize, rule.product);
    assert.equal(config.drawSize, rule.drawSize, rule.product);
    assert.equal(config.defaultBetSize, rule.minBetSize, rule.product);
    for (const size of [rule.minBetSize, rule.maxBetSize]) {
      const numbers = Array.from({ length: size }, (_, i) => config.minNumber + i);
      const game = {
        lottery: rule.product as LotteryId, numbers,
        fixedNumbers: rule.product === "lotofacil" ? numbers.slice(0, 8) : [],
        variableNumbers: rule.product === "lotofacil" ? numbers.slice(8) : [...numbers],
        metadata: { odd: 0, even: 0, sum: 0, repeatedFromLastContest: [] },
      };
      assert.doesNotThrow(() => assertValidGeneratedGame(game), `${rule.product} size ${size}`);
      const quote = quoteOfficialBet(rule.product, size);
      assert.ok(quote);
      assert.equal(quote?.simpleEquivalentCount, combinationCount(size, rule.drawSize));
    }
  }
});

test("all structured quotes reject invalid game counts and preserve valid prices", () => {
  const quotes = [
    (count: number) => quoteMaisMilionaria(6, 2, count).totalPriceCents,
    (count: number) => quoteTimemania(count).totalPriceCents,
    (count: number) => quoteSuperSete([1,1,1,1,1,1,1], count).totalPriceCents,
    (count: number) => quoteOfficialBet("mega-sena", 6, count)!.totalPriceCents,
  ];
  for (const quote of quotes) {
    for (const count of [0, -1, 1.5, Number.NaN, Infinity]) {
      assert.throws(() => quote(count), /gameCount must be a positive integer/);
    }
    const base = quote(1);
    assert.ok(base > 0);
    assert.equal(quote(3), base * 3);
  }
});
