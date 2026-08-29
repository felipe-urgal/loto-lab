import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { Pool } from "pg";
import { createLotoLabServer } from "../src/api/server.js";
import type { ContestSource, LotteryAgendaSnapshot } from "../src/data/source.js";
import { runMigrations } from "../src/db/migrations.js";
import type { Contest, LotteryId } from "../src/domain/types.js";
import { runOperationalSync, type SyncAllDetails } from "../src/operations/sync.js";
import { PostgresOperationRepository } from "../src/persistence/operationRepository.js";

const databaseUrl = process.env.DATABASE_URL;

function contest(lottery: LotteryId, number: number): Contest {
  if (lottery === "mega-sena") {
    return {
      lottery,
      number,
      date: `2026-08-${String(number).padStart(2, "0")}`,
      numbers: [1, 2, 3, 4, 5, 6],
      prizeTiers: [
        { description: "6 acertos", winners: 0, prizeValue: 0 },
        { description: "5 acertos", winners: 0, prizeValue: 0 },
        { description: "4 acertos", winners: 0, prizeValue: 0 },
      ],
    };
  }
  if (lottery === "lotofacil") {
    return {
      lottery,
      number,
      date: `2026-08-${String(number).padStart(2, "0")}`,
      numbers: Array.from({ length: 15 }, (_, index) => index + 1),
      prizeTiers: [15, 14, 13, 12, 11].map((hits) => ({
        description: `${hits} acertos`,
        winners: 0,
        prizeValue: 0,
      })),
    };
  }
  return {
    lottery,
    number,
    date: `2026-08-${String(number).padStart(2, "0")}`,
    numbers: [1, 2, 3, 4, 5, 6, 7],
    luckyMonth: "Janeiro",
    prizeTiers: [
      { description: "7 acertos", winners: 0, prizeValue: 0 },
      { description: "6 acertos", winners: 0, prizeValue: 0 },
      { description: "5 acertos", winners: 0, prizeValue: 0 },
      { description: "4 acertos", winners: 0, prizeValue: 0 },
      { description: "Mês da Sorte", winners: 0, prizeValue: 0 },
    ],
  };
}

class SuccessfulSource implements ContestSource {
  async fetchContest(lottery: LotteryId, contestNumber?: number): Promise<Contest> {
    return contest(lottery, contestNumber ?? 2);
  }

  async fetchContestRange(lottery: LotteryId, startContest: number, endContest: number): Promise<Contest[]> {
    return Array.from(
      { length: endContest - startContest + 1 },
      (_, index) => contest(lottery, startContest + index),
    );
  }
}

class PartialSource extends SuccessfulSource {
  override async fetchContest(lottery: LotteryId, contestNumber?: number): Promise<Contest> {
    if (lottery === "mega-sena" && contestNumber === 1) {
      throw new Error("synthetic contest fetch failure");
    }
    return super.fetchContest(lottery, contestNumber);
  }
}

class FailingSource implements ContestSource {
  async fetchContest(lottery: LotteryId): Promise<Contest> {
    throw new Error(`source unavailable for ${lottery}`);
  }

  async fetchContestRange(): Promise<Contest[]> {
    throw new Error("source unavailable for range");
  }
}

class AgendaSource extends SuccessfulSource {
  async fetchAgenda(lottery: LotteryId): Promise<LotteryAgendaSnapshot> {
    return {
      lottery,
      currentContest: 2,
      nextContest: 3,
      nextDrawDate: "2026-08-20",
      estimatedPrize: lottery === "mega-sena" ? 50_000_000 : 2_000_000,
      accumulated: lottery === "mega-sena",
    };
  }
}

class BlockingSource extends SuccessfulSource {
  private blocked = false;
  private releaseBlocked!: () => void;
  private markStarted!: () => void;
  private readonly releasePromise = new Promise<void>((resolve) => {
    this.releaseBlocked = resolve;
  });
  readonly started = new Promise<void>((resolve) => {
    this.markStarted = resolve;
  });

  override async fetchContest(lottery: LotteryId, contestNumber?: number): Promise<Contest> {
    if (!this.blocked && contestNumber === undefined) {
      this.blocked = true;
      this.markStarted();
      await this.releasePromise;
    }
    return super.fetchContest(lottery, contestNumber);
  }

  release(): void {
    this.releaseBlocked();
  }
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

test(
  "operational sync persists partial/failed states, rejects concurrent HTTP sync and surfaces notification failure",
  { skip: !databaseUrl, timeout: 30_000 },
  async (t) => {
    const connectionString = databaseUrl!;
    const admin = new Pool({ connectionString, max: 1 });
    const schema = `ops_fail_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    await admin.query(`CREATE SCHEMA "${schema}"`);

    const pool = new Pool({ connectionString, max: 6, options: `-c search_path=${schema},public` });
    let server: ReturnType<typeof createLotoLabServer> | undefined;

    t.after(async () => {
      if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
      await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    });

    await runMigrations(pool);
    const operations = new PostgresOperationRepository(pool);

    const partial = await runOperationalSync(pool, {
      source: new PartialSource(),
      retries: 0,
      retryDelayMs: 0,
    });
    assert.equal(partial.status, "partial");
    assert.equal(partial.details.successfulLotteries, 3);
    assert.equal(partial.details.failedLotteries, 0);
    const partialMega = partial.details.lotteries.find((item) => item.lottery === "mega-sena");
    assert.equal(partialMega?.status, "partial");
    assert.equal(partialMega?.failedContests, 1);
    assert.equal(partialMega?.fetched, 1);
    assert.ok(partial.details.lotteries
      .filter((item) => item.lottery !== "mega-sena")
      .every((item) => item.status === "success"));

    let latest = await operations.latest<SyncAllDetails>("sync-all");
    assert.equal(latest?.id, partial.id);
    assert.equal(latest?.status, "partial");

    const failed = await runOperationalSync(pool, {
      source: new FailingSource(),
      retries: 0,
      retryDelayMs: 0,
    });
    assert.equal(failed.status, "failed");
    assert.equal(failed.details.successfulLotteries, 0);
    assert.equal(failed.details.failedLotteries, 3);
    assert.ok(failed.details.lotteries.every((item) => item.status === "failed"));
    assert.ok(failed.details.lotteries.every((item) => item.error?.startsWith("source unavailable for ")));

    server = createLotoLabServer({ pool, operationSource: new SuccessfulSource() });
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const failedStatusResponse = await fetch(`${baseUrl}/api/v1/operations/status`);
    assert.equal(failedStatusResponse.status, 200);
    const failedStatus = await responseJson(failedStatusResponse);
    assert.equal(failedStatus.stale, true);
    assert.equal((failedStatus.latest as { status: string }).status, "failed");

    const blockingSource = new BlockingSource();
    const activeRun = runOperationalSync(pool, {
      source: blockingSource,
      retries: 0,
      retryDelayMs: 0,
    });
    await blockingSource.started;

    let activeResult: Awaited<ReturnType<typeof runOperationalSync>> | undefined;
    try {
      const conflictResponse = await fetch(`${baseUrl}/api/v1/operations/sync`, { method: "POST" });
      assert.equal(conflictResponse.status, 409);
      const conflict = await responseJson(conflictResponse);
      assert.equal((conflict.error as { code: string }).code, "OPERATION_ALREADY_RUNNING");
    } finally {
      blockingSource.release();
      activeResult = await activeRun;
    }
    assert.equal(activeResult.status, "success");

    const httpSuccess = await fetch(`${baseUrl}/api/v1/operations/sync`, { method: "POST" });
    assert.equal(httpSuccess.status, 200);
    assert.equal((await responseJson(httpSuccess)).status, "success");

    await pool.query(`
      CREATE OR REPLACE FUNCTION reject_notifications_for_test()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'notifications blocked for test';
      END;
      $$;

      CREATE TRIGGER reject_notifications_for_test
      BEFORE INSERT OR UPDATE ON notifications
      FOR EACH ROW
      EXECUTE FUNCTION reject_notifications_for_test();
    `);

    let notificationFailure: Awaited<ReturnType<typeof runOperationalSync>>;
    try {
      notificationFailure = await runOperationalSync(pool, {
        source: new AgendaSource(),
        retries: 0,
        retryDelayMs: 0,
      });
    } finally {
      await pool.query("DROP TRIGGER IF EXISTS reject_notifications_for_test ON notifications");
      await pool.query("DROP FUNCTION IF EXISTS reject_notifications_for_test()");
    }

    assert.equal(notificationFailure.status, "partial");
    assert.equal(notificationFailure.details.successfulLotteries, 3);
    assert.equal(notificationFailure.details.failedLotteries, 0);
    assert.equal(notificationFailure.details.notificationRefresh, "failed");
    assert.match(notificationFailure.details.notificationError ?? "", /notifications blocked for test/);

    latest = await operations.latest<SyncAllDetails>("sync-all");
    assert.equal(latest?.id, notificationFailure.id);
    assert.equal(latest?.status, "partial");
    assert.equal(latest?.details.notificationRefresh, "failed");
  },
);
