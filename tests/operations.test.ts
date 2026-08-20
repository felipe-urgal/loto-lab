import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import type { Contest, LotteryId } from "../src/domain/types.js";
import type { ContestSource } from "../src/data/source.js";
import { runMigrations } from "../src/db/migrations.js";
import { PostgresContestRepository } from "../src/persistence/contestRepository.js";
import { PostgresOperationRepository } from "../src/persistence/operationRepository.js";
import { runOperationalSync, type SyncAllDetails } from "../src/operations/sync.js";

function contest(lottery: LotteryId, number: number): Contest {
  if (lottery === "mega-sena") {
    return {
      lottery,
      number,
      date: `2026-08-${String(number).padStart(2, "0")}`,
      numbers: [1, 2, 3, 4, 5, 6],
      prizeTiers: [{ description: "6 acertos", winners: 0, prizeValue: 0 }],
    };
  }
  if (lottery === "lotofacil") {
    return {
      lottery,
      number,
      date: `2026-08-${String(number).padStart(2, "0")}`,
      numbers: Array.from({ length: 15 }, (_, index) => index + 1),
      prizeTiers: [{ description: "15 acertos", winners: 0, prizeValue: 0 }],
    };
  }
  return {
    lottery,
    number,
    date: `2026-08-${String(number).padStart(2, "0")}`,
    numbers: [1, 2, 3, 4, 5, 6, 7],
    luckyMonth: "Janeiro",
    prizeTiers: [{ description: "7 acertos", winners: 0, prizeValue: 0 }],
  };
}

class FakeContestSource implements ContestSource {
  async fetchContest(lottery: LotteryId, contestNumber?: number): Promise<Contest> {
    return contest(lottery, contestNumber ?? 2);
  }

  async fetchContestRange(
    lottery: LotteryId,
    startContest: number,
    endContest: number,
  ): Promise<Contest[]> {
    return Array.from(
      { length: endContest - startContest + 1 },
      (_, index) => contest(lottery, startContest + index),
    );
  }
}

test(
  "operational sync fills gaps, refreshes latest contests and audits the run",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const connectionString = process.env.DATABASE_URL!;
    const admin = new Pool({ connectionString, max: 1 });
    const schema = `ops_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    await admin.query(`CREATE SCHEMA "${schema}"`);

    const pool = new Pool({
      connectionString,
      max: 4,
      options: `-c search_path=${schema},public`,
    });

    t.after(async () => {
      await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    });

    await runMigrations(pool);
    const result = await runOperationalSync(pool, {
      source: new FakeContestSource(),
      retries: 0,
      retryDelayMs: 0,
    });

    assert.equal(result.status, "success");
    assert.equal(result.details.successfulLotteries, 3);
    assert.equal(result.details.failedLotteries, 0);
    assert.equal(result.details.lotteries.length, 3);
    assert.ok(result.details.lotteries.every((item) => item.latestOfficialContest === 2));
    assert.ok(result.details.lotteries.every((item) => item.totalStored === 2));

    const contests = new PostgresContestRepository(pool);
    for (const lottery of ["mega-sena", "lotofacil", "dia-de-sorte"] as const) {
      const status = await contests.getDataStatus(lottery);
      assert.equal(status.contestCount, 2);
      assert.equal(status.missingContestCount, 0);
      assert.equal(status.financialCoverage, 1);
    }

    const latest = await new PostgresOperationRepository(pool).latest<SyncAllDetails>("sync-all");
    assert.ok(latest);
    assert.equal(latest.status, "success");
    assert.ok(latest.finishedAt);
    assert.equal(latest.details.successfulLotteries, 3);
  },
);
