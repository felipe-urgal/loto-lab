import type { Pool } from "pg";
import type { LotteryProductId } from "../domain/lotteryCatalog.js";
import type { LotteryProductResult } from "../data/caixaProduct.js";

interface LotteryProductResultRow {
  product_id: LotteryProductId;
  contest_number: number;
  draw_date: string;
  result: LotteryProductResult["result"];
  prize_tiers: LotteryProductResult["prizeTiers"] | null;
  amount_collected: number | null;
  source: LotteryProductResult["source"];
}

interface LotteryProductStatusRow {
  result_count: string;
  first_contest: number | null;
  last_contest: number | null;
  last_updated_at: Date | null;
}

export interface LotteryProductDataStatus {
  product: LotteryProductId;
  resultCount: number;
  firstContest?: number;
  lastContest?: number;
  internalMissingContestCount: number;
  lastUpdatedAt?: string;
}

function mapRow(row: LotteryProductResultRow): LotteryProductResult {
  return {
    product: row.product_id,
    contestNumber: row.contest_number,
    drawDate: row.draw_date,
    result: row.result,
    ...(row.prize_tiers?.length ? { prizeTiers: row.prize_tiers } : {}),
    ...(row.amount_collected !== null ? { amountCollected: Number(row.amount_collected) } : {}),
    source: row.source,
  };
}

export class PostgresLotteryProductResultRepository {
  constructor(private readonly pool: Pool) {}

  async upsertMany(results: LotteryProductResult[]): Promise<void> {
    if (results.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const item of results) {
        await client.query(
          `
            INSERT INTO lottery_product_results (
              product_id,
              contest_number,
              draw_date,
              result,
              prize_tiers,
              amount_collected,
              source
            ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7::jsonb)
            ON CONFLICT (product_id, contest_number) DO UPDATE SET
              draw_date = EXCLUDED.draw_date,
              result = EXCLUDED.result,
              prize_tiers = COALESCE(EXCLUDED.prize_tiers, lottery_product_results.prize_tiers),
              amount_collected = COALESCE(EXCLUDED.amount_collected, lottery_product_results.amount_collected),
              source = EXCLUDED.source,
              updated_at = NOW()
          `,
          [
            item.product,
            item.contestNumber,
            item.drawDate,
            JSON.stringify(item.result),
            item.prizeTiers === undefined ? null : JSON.stringify(item.prizeTiers),
            item.amountCollected ?? null,
            JSON.stringify(item.source),
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findByNumber(
    product: LotteryProductId,
    contestNumber: number,
  ): Promise<LotteryProductResult | undefined> {
    const result = await this.pool.query<LotteryProductResultRow>(
      `
        SELECT
          product_id,
          contest_number,
          draw_date::text AS draw_date,
          result,
          prize_tiers,
          amount_collected::float8 AS amount_collected,
          source
        FROM lottery_product_results
        WHERE product_id = $1 AND contest_number = $2
      `,
      [product, contestNumber],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async getDataStatus(product: LotteryProductId): Promise<LotteryProductDataStatus> {
    const result = await this.pool.query<LotteryProductStatusRow>(
      `
        SELECT
          COUNT(*)::text AS result_count,
          MIN(contest_number) AS first_contest,
          MAX(contest_number) AS last_contest,
          MAX(updated_at) AS last_updated_at
        FROM lottery_product_results
        WHERE product_id = $1
      `,
      [product],
    );
    const row = result.rows[0]!;
    const resultCount = Number(row.result_count);
    const firstContest = row.first_contest ?? undefined;
    const lastContest = row.last_contest ?? undefined;
    const internalMissingContestCount = firstContest === undefined || lastContest === undefined
      ? 0
      : Math.max(0, (lastContest - firstContest + 1) - resultCount);

    return {
      product,
      resultCount,
      ...(firstContest !== undefined ? { firstContest } : {}),
      ...(lastContest !== undefined ? { lastContest } : {}),
      internalMissingContestCount,
      ...(row.last_updated_at ? { lastUpdatedAt: row.last_updated_at.toISOString() } : {}),
    };
  }
}
