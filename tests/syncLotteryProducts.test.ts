import test from "node:test";
import assert from "node:assert/strict";
import type { LotteryProductResult, LotteryProductSource } from "../src/data/caixaProduct.js";
import { syncLotteryProducts } from "../src/application/syncLotteryProducts.js";

function result(product: LotteryProductResult["product"], contestNumber: number): LotteryProductResult {
  return {
    product,
    contestNumber,
    drawDate: "2026-09-30",
    result: { family: "number-draw", numbers: [1, 2, 3, 4, 5] },
    source: {
      provider: "caixa",
      endpoint: `https://example.test/${product}/${contestNumber}`,
    },
  };
}

test("product sync isolates failures and skips unsupported operational products", async () => {
  const stored: LotteryProductResult[] = [];
  const source: LotteryProductSource = {
    async fetchResult(product) {
      if (product === "lotomania") throw new Error("synthetic upstream failure");
      return result(product, product === "quina" ? 10 : 20);
    },
    async fetchAgenda() {
      throw new Error("not used");
    },
  };
  const repository = {
    async upsertMany(items: LotteryProductResult[]) {
      stored.push(...items);
    },
  };

  const summary = await syncLotteryProducts(
    ["quina", "lotomania", "dupla-sena", "lotogol", "instantanea"],
    source,
    repository,
  );

  assert.deepEqual(summary, [
    { product: "quina", status: "success", contestNumber: 10 },
    { product: "lotomania", status: "failed", error: "synthetic upstream failure" },
    { product: "dupla-sena", status: "success", contestNumber: 20 },
    { product: "lotogol", status: "skipped" },
    { product: "instantanea", status: "skipped" },
  ]);
  assert.deepEqual(stored.map((item) => item.product), ["quina", "dupla-sena"]);
});
