import test from "node:test";
import assert from "node:assert/strict";
import type { Contest, GeneratedGame } from "../src/domain/types.js";
import { hasCompletePrizeSchedule } from "../src/finance/prizes.js";
import { PostgresContestRepository } from "../src/persistence/contestRepository.js";
import { PostgresGameRepository } from "../src/persistence/gameRepository.js";
import { RealBetService } from "../src/realBets/service.js";
import {
  acquireRuntimeInstanceLock,
  RuntimeInstanceAlreadyActiveError,
} from "../src/operations/runtimeLock.js";
import { validatePublicExposure } from "../src/api/publicExposure.js";
import { createIsolatedPostgresDatabase } from "./helpers/postgres.js";

const TARGET = 990001;

function testGame(): GeneratedGame {
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

function contest(prizeTiers: Contest["prizeTiers"]): Contest {
  return {
    lottery: "mega-sena",
    number: TARGET,
    date: "2099-01-01",
    numbers: [1, 2, 3, 4, 40, 50],
    ...(prizeTiers ? { prizeTiers } : {}),
  };
}

const partialTiers = [
  { description: "6 acertos", winners: 0, prizeValue: 0 },
  { description: "5 acertos", winners: 2, prizeValue: 50000 },
];

const completeTiers = [
  ...partialTiers,
  { description: "4 acertos", winners: 100, prizeValue: 777 },
];

const correctedCompleteTiers = [
  ...partialTiers,
  { description: "4 acertos", winners: 100, prizeValue: 888 },
];

test(
  "real-bet finance remains reconcilable, complete schedules never downgrade and official corrections are audited",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const database = await createIsolatedPostgresDatabase({ label: "auditability-finance" });
    const { pool } = database;
    const contests = new PostgresContestRepository(pool);
    const games = new PostgresGameRepository(pool);
    const service = new RealBetService(pool);

    try {
      const batch = await games.saveBatch({
        lottery: "mega-sena",
        targetContestNumber: TARGET,
        generatorOptions: { test: "auditability-hardening" },
        games: [testGame()],
      });

      const bet = await service.create({ batchId: batch.id, actualCost: 6 });
      assert.equal(bet.status, "awaiting_result");
      assert.equal(bet.totalPrizeValue, undefined);

      await contests.upsertMany([contest(partialTiers)]);
      const statisticallyChecked = await service.reconcile(bet.id);
      assert.equal(statisticallyChecked?.status, "checked");
      assert.equal(statisticallyChecked?.totalPrizeValue, undefined);
      assert.equal(statisticallyChecked?.netResult, undefined);

      await contests.upsertMany([contest(completeTiers)]);
      const financiallyResolved = await service.reconcilePending("mega-sena");
      assert.equal(financiallyResolved, 1);
      const checked = await service.realBets.findById(bet.id);
      assert.equal(checked?.totalPrizeValue, 777);
      assert.equal(checked?.netResult, 771);
      assert.ok(checked?.checkedAt);
      const firstCheckedAt = checked!.checkedAt;

      await contests.upsertMany([contest(partialTiers)]);
      const preserved = await contests.findByNumber("mega-sena", TARGET);
      assert.ok(preserved);
      assert.equal(hasCompletePrizeSchedule(preserved), true);
      assert.equal(preserved.prizeTiers?.find((tier) => tier.description === "4 acertos")?.prizeValue, 777);

      await contests.upsertMany([contest(correctedCompleteTiers)]);
      const correction = await service.reconcileContestNumbers("mega-sena", [TARGET]);
      assert.deepEqual(correction, { financiallyResolved: 0, financiallyRevised: 1 });

      const revised = await service.realBets.findById(bet.id);
      assert.equal(revised?.totalPrizeValue, 888);
      assert.equal(revised?.netResult, 882);
      assert.equal(revised?.checkedAt, firstCheckedAt);

      const revisions = await service.realBets.listFinancialRevisions(bet.id);
      assert.equal(revisions.length, 1);
      assert.equal(revisions[0]?.previousTotalPrizeValue, 777);
      assert.equal(revisions[0]?.newTotalPrizeValue, 888);
      assert.equal(revisions[0]?.previousNetResult, 771);
      assert.equal(revisions[0]?.newNetResult, 882);
      assert.equal(revisions[0]?.reason, "official-prize-refresh");
    } finally {
      await database.close();
    }
  },
);

test(
  "runtime instance advisory lock rejects a second active process",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const database = await createIsolatedPostgresDatabase({ label: "auditability-runtime-lock" });
    const { pool } = database;
    try {
      const first = await acquireRuntimeInstanceLock(pool);
      try {
        await assert.rejects(
          () => acquireRuntimeInstanceLock(pool),
          RuntimeInstanceAlreadyActiveError,
        );
      } finally {
        await first.release();
      }

      const second = await acquireRuntimeInstanceLock(pool);
      await second.release();
    } finally {
      await database.close();
    }
  },
);

test("public exposure guard requires auth and HTTPS outside loopback", () => {
  assert.doesNotThrow(() => validatePublicExposure({ API_HOST: "127.0.0.1" }));

  assert.throws(
    () => validatePublicExposure({ API_HOST: "0.0.0.0" }),
    /requires APP_AUTH_USER and APP_AUTH_PASSWORD/i,
  );

  assert.throws(
    () => validatePublicExposure({
      API_HOST: "0.0.0.0",
      APP_AUTH_USER: "loto-admin",
      APP_AUTH_PASSWORD: "long-random-password",
      PUBLIC_ORIGIN: "http://example.test",
    }),
    /requires an https:\/\/ PUBLIC_ORIGIN/i,
  );

  assert.doesNotThrow(() => validatePublicExposure({
    API_HOST: "0.0.0.0",
    APP_AUTH_USER: "loto-admin",
    APP_AUTH_PASSWORD: "long-random-password",
    PUBLIC_ORIGIN: "https://example.test",
  }));
});
