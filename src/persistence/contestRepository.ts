import type { Pool } from "pg";
import type { Contest, ContestPrizeTier, LotteryId } from "../domain/types.js";
import { hasCompletePrizeSchedule } from "../finance/prizes.js";

interface ContestRow {
  id: string;
  lottery: LotteryId;
  contest_number: number;
  draw_date: string;
  numbers: number[];
  lucky_month: string | null;
  amount_collected: number | null;
  prize_tiers: ContestPrizeTier[];
}

interface AnalysisContestRow {
  lottery: LotteryId;
  contest_number: number;
  draw_date: string;
  numbers: number[];
}

interface GenerationContestRow extends AnalysisContestRow {
  lucky_month: string | null;
}

interface ContestStatusRow {
  contest_count: string;
  first_contest: number | null;
  last_contest: number | null;
  financial_contest_count: string;
  last_updated_at: Date | null;
}

function mapContest(row: ContestRow): Contest {
  return {
    lottery: row.lottery,
    number: row.contest_number,
    date: row.draw_date,
    numbers: row.numbers.map(Number),
    ...(row.lucky_month ? { luckyMonth: row.lucky_month } : {}),
    ...(row.prize_tiers.length > 0 ? { prizeTiers: row.prize_tiers } : {}),
    ...(row.amount_collected !== null ? { amountCollected: Number(row.amount_collected) } : {}),
  };
}

function mapAnalysisContest(row: AnalysisContestRow): Contest {
  return {
    lottery: row.lottery,
    number: row.contest_number,
    date: row.draw_date,
    numbers: row.numbers.map(Number),
  };
}

function mapGenerationContest(row: GenerationContestRow): Contest {
  return {
    ...mapAnalysisContest(row),
    ...(row.lucky_month ? { luckyMonth: row.lucky_month } : {}),
  };
}

export interface ContestListOptions {
  lottery?: LotteryId;
  startContest?: number;
  endContest?: number;
  limit?: number;
  order?: "asc" | "desc";
}

export interface ContestDataStatus {
  lottery: LotteryId;
  contestCount: number;
  firstContest?: number;
  lastContest?: number;
  /** Backward-compatible alias for internalMissingContestCount. */
  missingContestCount: number;
  internalMissingContestCount: number;
  historyBeforeFirstContestCount: number;
  financialContestCount: number;
  financialCoverage: number;
  lastUpdatedAt?: string;
}

export class PostgresContestRepository {
  constructor(private readonly pool: Pool) {}

  async upsertMany(contests: Contest[]): Promise<void> {
    if (contests.length === 0) return;
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      for (const contest of contests) {
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO contests (
              lottery, contest_number, draw_date, numbers, lucky_month, amount_collected
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (lottery, contest_number) DO UPDATE SET
              draw_date = EXCLUDED.draw_date,
              numbers = EXCLUDED.numbers,
              lucky_month = COALESCE(EXCLUDED.lucky_month, contests.lucky_month),
              amount_collected = COALESCE(EXCLUDED.amount_collected, contests.amount_collected),
              updated_at = NOW()
            RETURNING id
          `,
          [
            contest.lottery,
            contest.number,
            contest.date,
            contest.numbers,
            contest.luckyMonth ?? null,
            contest.amountCollected ?? null,
          ],
        );
        const contestId = result.rows[0]!.id;

        if (contest.prizeTiers !== undefined) {
          let shouldReplacePrizeTiers = true;

          // Official APIs can transiently expose only part of the payout table.
          // Once a complete schedule has been stored, never downgrade it with a
          // later incomplete snapshot. A new complete schedule can still replace
          // it, allowing official corrections to propagate.
          if (!hasCompletePrizeSchedule(contest)) {
            const existing = await client.query<ContestPrizeTier>(
              `
                SELECT
                  description,
                  winners,
                  prize_value::float8 AS "prizeValue"
                FROM contest_prize_tiers
                WHERE contest_id = $1
                ORDER BY id
              `,
              [contestId],
            );
            if (existing.rows.length > 0 && hasCompletePrizeSchedule({
              ...contest,
              prizeTiers: existing.rows,
            })) {
              shouldReplacePrizeTiers = false;
            }
          }

          if (shouldReplacePrizeTiers) {
            await client.query("DELETE FROM contest_prize_tiers WHERE contest_id = $1", [contestId]);
            for (const tier of contest.prizeTiers) {
              await client.query(
                `
                  INSERT INTO contest_prize_tiers (
                    contest_id, description, winners, prize_value
                  ) VALUES ($1, $2, $3, $4)
                `,
                [contestId, tier.description, tier.winners, tier.prizeValue],
              );
            }
          }
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findByNumber(lottery: LotteryId, contestNumber: number): Promise<Contest | undefined> {
    const rows = await this.queryContests({
      lottery,
      startContest: contestNumber,
      endContest: contestNumber,
      limit: 1,
    });
    return rows[0];
  }

  async list(options: ContestListOptions = {}): Promise<Contest[]> {
    return this.queryContests(options);
  }

  async listAnalysisHistory(lottery: LotteryId): Promise<Contest[]> {
    const result = await this.pool.query<AnalysisContestRow>(
      `
        SELECT
          lottery,
          contest_number,
          draw_date::text AS draw_date,
          numbers
        FROM contests
        WHERE lottery = $1
        ORDER BY contest_number ASC
      `,
      [lottery],
    );
    return result.rows.map(mapAnalysisContest);
  }

  async listGenerationHistory(lottery: LotteryId): Promise<Contest[]> {
    const result = await this.pool.query<GenerationContestRow>(
      `
        SELECT
          lottery,
          contest_number,
          draw_date::text AS draw_date,
          numbers,
          lucky_month
        FROM contests
        WHERE lottery = $1
        ORDER BY contest_number ASC
      `,
      [lottery],
    );
    return result.rows.map(mapGenerationContest);
  }

  async listContestNumbers(
    lottery: LotteryId,
    startContest: number,
    endContest: number,
  ): Promise<number[]> {
    if (
      !Number.isInteger(startContest) ||
      !Number.isInteger(endContest) ||
      startContest < 1 ||
      endContest < startContest
    ) {
      throw new Error("Invalid contest-number range");
    }

    const result = await this.pool.query<{ contest_number: number }>(
      `
        SELECT contest_number
        FROM contests
        WHERE lottery = $1
          AND contest_number BETWEEN $2 AND $3
        ORDER BY contest_number
      `,
      [lottery, startContest, endContest],
    );
    return result.rows.map((row) => row.contest_number);
  }

  async getDataStatus(lottery: LotteryId): Promise<ContestDataStatus> {
    const result = await this.pool.query<ContestStatusRow>(
      `
        SELECT
          COUNT(*)::text AS contest_count,
          MIN(c.contest_number) AS first_contest,
          MAX(c.contest_number) AS last_contest,
          COUNT(*) FILTER (
            WHERE CASE c.lottery
              WHEN 'mega-sena' THEN
                EXISTS (SELECT 1 FROM contest_prize_tiers p WHERE p.contest_id = c.id AND p.description ~* '(^|[^0-9])4[[:space:]]*acertos?')
                AND EXISTS (SELECT 1 FROM contest_prize_tiers p WHERE p.contest_id = c.id AND p.description ~* '(^|[^0-9])5[[:space:]]*acertos?')
                AND EXISTS (SELECT 1 FROM contest_prize_tiers p WHERE p.contest_id = c.id AND p.description ~* '(^|[^0-9])6[[:space:]]*acertos?')
              WHEN 'lotofacil' THEN
                EXISTS (SELECT 1 FROM contest_prize_tiers p WHERE p.contest_id = c.id AND p.description ~* '(^|[^0-9])11[[:space:]]*acertos?')
                AND EXISTS (SELECT 1 FROM contest_prize_tiers p WHERE p.contest_id = c.id AND p.description ~* '(^|[^0-9])12[[:space:]]*acertos?')
                AND EXISTS (SELECT 1 FROM contest_prize_tiers p WHERE p.contest_id = c.id AND p.description ~* '(^|[^0-9])13[[:space:]]*acertos?')
                AND EXISTS (SELECT 1 FROM contest_prize_tiers p WHERE p.contest_id = c.id AND p.description ~* '(^|[^0-9])14[[:space:]]*acertos?')
                AND EXISTS (SELECT 1 FROM contest_prize_tiers p WHERE p.contest_id = c.id AND p.description ~* '(^|[^0-9])15[[:space:]]*acertos?')
              WHEN 'dia-de-sorte' THEN
                EXISTS (SELECT 1 FROM contest_prize_tiers p WHERE p.contest_id = c.id AND p.description ~* '(^|[^0-9])4[[:space:]]*acertos?')
                AND EXISTS (SELECT 1 FROM contest_prize_tiers p WHERE p.contest_id = c.id AND p.description ~* '(^|[^0-9])5[[:space:]]*acertos?')
                AND EXISTS (SELECT 1 FROM contest_prize_tiers p WHERE p.contest_id = c.id AND p.description ~* '(^|[^0-9])6[[:space:]]*acertos?')
                AND EXISTS (SELECT 1 FROM contest_prize_tiers p WHERE p.contest_id = c.id AND p.description ~* '(^|[^0-9])7[[:space:]]*acertos?')
                AND EXISTS (
                  SELECT 1 FROM contest_prize_tiers p
                  WHERE p.contest_id = c.id
                    AND (
                      LOWER(p.description) LIKE '%mês da sorte%'
                      OR LOWER(p.description) LIKE '%mes da sorte%'
                      OR LOWER(p.description) LIKE '%mes de sorte%'
                    )
                )
              ELSE FALSE
            END
          )::text AS financial_contest_count,
          MAX(c.updated_at) AS last_updated_at
        FROM contests c
        WHERE c.lottery = $1
      `,
      [lottery],
    );

    const row = result.rows[0]!;
    const contestCount = Number(row.contest_count);
    const financialContestCount = Number(row.financial_contest_count);
    const firstContest = row.first_contest ?? undefined;
    const lastContest = row.last_contest ?? undefined;
    const internalMissingContestCount = firstContest === undefined || lastContest === undefined
      ? 0
      : Math.max(0, (lastContest - firstContest + 1) - contestCount);
    const historyBeforeFirstContestCount = firstContest === undefined ? 0 : Math.max(0, firstContest - 1);

    return {
      lottery,
      contestCount,
      ...(firstContest !== undefined ? { firstContest } : {}),
      ...(lastContest !== undefined ? { lastContest } : {}),
      missingContestCount: internalMissingContestCount,
      internalMissingContestCount,
      historyBeforeFirstContestCount,
      financialContestCount,
      financialCoverage: contestCount === 0 ? 0 : financialContestCount / contestCount,
      ...(row.last_updated_at ? { lastUpdatedAt: row.last_updated_at.toISOString() } : {}),
    };
  }

  private async queryContests(options: ContestListOptions): Promise<Contest[]> {
    const clauses: string[] = [];
    const values: unknown[] = [];

    if (options.lottery) {
      values.push(options.lottery);
      clauses.push(`c.lottery = $${values.length}`);
    }
    if (options.startContest !== undefined) {
      values.push(options.startContest);
      clauses.push(`c.contest_number >= $${values.length}`);
    }
    if (options.endContest !== undefined) {
      values.push(options.endContest);
      clauses.push(`c.contest_number <= $${values.length}`);
    }

    let limit = "";
    if (options.limit !== undefined) {
      if (!Number.isInteger(options.limit) || options.limit < 1) {
        throw new Error("Contest list limit must be a positive integer");
      }
      values.push(options.limit);
      limit = `LIMIT $${values.length}`;
    }

    const direction = options.order === "desc" ? "DESC" : "ASC";
    const orderBy = options.lottery
      ? `c.contest_number ${direction}`
      : `c.lottery ASC, c.contest_number ${direction}`;
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await this.pool.query<ContestRow>(
      `
        SELECT
          c.id,
          c.lottery,
          c.contest_number,
          c.draw_date::text AS draw_date,
          c.numbers,
          c.lucky_month,
          c.amount_collected::float8 AS amount_collected,
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'description', p.description,
                'winners', p.winners,
                'prizeValue', p.prize_value::float8
              ) ORDER BY p.id
            ) FILTER (WHERE p.id IS NOT NULL),
            '[]'::jsonb
          ) AS prize_tiers
        FROM contests c
        LEFT JOIN contest_prize_tiers p ON p.contest_id = c.id
        ${where}
        GROUP BY c.id
        ORDER BY ${orderBy}
        ${limit}
      `,
      values,
    );

    return result.rows.map(mapContest);
  }
}
