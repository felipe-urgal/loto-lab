import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import type { Contest, GeneratedGame } from "../src/domain/types.js";
import { normalizeIsoDateTime } from "../src/domain/dateTime.js";
import { createLotoLabServer } from "../src/api/server.js";
import { PostgresContestRepository } from "../src/persistence/contestRepository.js";
import { PostgresGameRepository } from "../src/persistence/gameRepository.js";
import { RealBetService } from "../src/realBets/service.js";
import { createIsolatedPostgresDatabase } from "./helpers/postgres.js";

const TARGET = 990101;

function game(): GeneratedGame {
  return {
    lottery: "mega-sena",
    numbers: [1, 2, 3, 4, 20, 30],
    fixedNumbers: [1, 2, 3],
    variableNumbers: [4, 20, 30],
    metadata: {
      odd: 2,
      even: 4,
      sum: 60,
      repeatedFromLastContest: [],
    },
  };
}

function officialContest(quadraPrize: number): Contest {
  return {
    lottery: "mega-sena",
    number: TARGET,
    date: "2099-01-01",
    numbers: [1, 2, 3, 4, 40, 50],
    prizeTiers: [
      { description: "6 acertos", winners: 0, prizeValue: 0 },
      { description: "5 acertos", winners: 2, prizeValue: 50_000 },
      { description: "4 acertos", winners: 100, prizeValue: quadraPrize },
    ],
  };
}

async function startServer(t: TestContext, pool: Pool): Promise<string> {
  const server = createLotoLabServer({ pool });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${(address as AddressInfo).port}`;
}

test("ISO real-bet timestamps reject impossible civil dates and malformed timezone offsets", () => {
  assert.equal(normalizeIsoDateTime("2026-02-31T12:00:00Z"), undefined);
  assert.equal(normalizeIsoDateTime("2026-04-31T12:00:00Z"), undefined);
  assert.equal(normalizeIsoDateTime("2026-01-01T12:00:00"), undefined);
  assert.equal(normalizeIsoDateTime("2026-01-01T12:00:00+24:00"), undefined);
  assert.equal(normalizeIsoDateTime("2026-01-01T12:00:00+03:60"), undefined);
  assert.equal(
    normalizeIsoDateTime("2024-02-29T12:00:00-03:00"),
    "2024-02-29T15:00:00.000Z",
  );
});

test("real-bet HTTP API rejects impossible playedAt before persistence", async (t) => {
  let databaseTouched = false;
  const pool = {
    async query() {
      databaseTouched = true;
      throw new Error("database should not be queried for invalid playedAt");
    },
  } as unknown as Pool;
  const baseUrl = await startServer(t, pool);

  const response = await fetch(`${baseUrl}/api/v1/real-bets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      batchId: 1,
      actualCost: 6,
      playedAt: "2026-02-31T12:00:00Z",
    }),
  });

  assert.equal(response.status, 400);
  assert.equal(databaseTouched, false);
  const payload = await response.json() as { error: { code: string } };
  assert.equal(payload.error.code, "INVALID_ARGUMENT");
});

test(
  "internal real-bet callers cannot persist an impossible playedAt",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const database = await createIsolatedPostgresDatabase({ label: "financial-integrity-date" });
    const { pool } = database;
    try {
      const batch = await new PostgresGameRepository(pool).saveBatch({
        lottery: "mega-sena",
        targetContestNumber: TARGET,
        generatorOptions: { test: "financial-integrity-date" },
        games: [game()],
      });
      const service = new RealBetService(pool);

      await assert.rejects(
        () => service.create({
          batchId: batch.id,
          actualCost: 6,
          playedAt: "2026-02-31T12:00:00Z",
        }),
        /INVALID_PLAYED_AT/,
      );
      assert.equal(await service.realBets.findByBatchId(batch.id), undefined);
    } finally {
      await database.close();
    }
  },
);

test(
  "concurrent official financial refresh creates exactly one audit revision",
  { skip: !process.env.DATABASE_URL, timeout: 15_000 },
  async () => {
    const database = await createIsolatedPostgresDatabase({ label: "financial-integrity-concurrency", max: 4 });
    const { pool } = database;
    const contests = new PostgresContestRepository(pool);
    const batches = new PostgresGameRepository(pool);
    const service = new RealBetService(pool);

    try {
      const batch = await batches.saveBatch({
        lottery: "mega-sena",
        targetContestNumber: TARGET,
        generatorOptions: { test: "financial-integrity-concurrency" },
        games: [game()],
      });
      const bet = await service.create({
        batchId: batch.id,
        actualCost: 6,
        playedAt: "2098-12-31T12:00:00-03:00",
      });

      await contests.upsertMany([officialContest(777)]);
      const initial = await service.reconcile(bet.id);
      assert.equal(initial?.totalPrizeValue, 777);
      assert.equal(initial?.netResult, 771);
      assert.equal((await service.realBets.listFinancialRevisions(bet.id)).length, 0);

      await contests.upsertMany([officialContest(888)]);
      const [left, right] = await Promise.all([
        service.reconcile(bet.id),
        service.reconcile(bet.id),
      ]);
      assert.equal(left?.totalPrizeValue, 888);
      assert.equal(right?.totalPrizeValue, 888);

      const revisions = await service.realBets.listFinancialRevisions(bet.id);
      assert.equal(revisions.length, 1);
      assert.equal(revisions[0]?.previousTotalPrizeValue, 777);
      assert.equal(revisions[0]?.newTotalPrizeValue, 888);
      assert.equal(revisions[0]?.previousNetResult, 771);
      assert.equal(revisions[0]?.newNetResult, 882);
    } finally {
      await database.close();
    }
  },
);
