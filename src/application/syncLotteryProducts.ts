import type { LotteryProductId } from "../domain/lotteryCatalog.js";
import type { LotteryProductResult, LotteryProductSource } from "../data/caixaProduct.js";

export interface LotteryProductResultWriter {
  upsertMany(results: LotteryProductResult[]): Promise<void>;
}

export interface LotteryProductSyncResult {
  product: LotteryProductId;
  status: "success" | "failed" | "skipped";
  contestNumber?: number;
  error?: string;
}

export async function syncLotteryProducts(
  products: LotteryProductId[],
  source: LotteryProductSource,
  repository: LotteryProductResultWriter,
): Promise<LotteryProductSyncResult[]> {
  const results: LotteryProductSyncResult[] = [];

  for (const product of products) {
    if (product === "instantanea" || product === "lotogol") {
      results.push({ product, status: "skipped" });
      continue;
    }

    try {
      const item = await source.fetchResult(product);
      await repository.upsertMany([item]);
      results.push({
        product,
        status: "success",
        contestNumber: item.contestNumber,
      });
    } catch (error) {
      results.push({
        product,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown sync failure",
      });
    }
  }

  return results;
}
