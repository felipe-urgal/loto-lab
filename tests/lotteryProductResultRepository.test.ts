import test from "node:test";
import assert from "node:assert/strict";
import { PostgresLotteryProductResultRepository } from "../src/persistence/lotteryProductResultRepository.js";
import { createIsolatedPostgresDatabase } from "./helpers/postgres.js";

const databaseUrl = process.env.DATABASE_URL;

test(
  "lottery product result persistence is idempotent and reports coverage",
  { skip: !databaseUrl },
  async (t) => {
    const database = await createIsolatedPostgresDatabase({
      label: "lottery-product-result",
      max: 4,
    });
    t.after(() => database.close());

    const repository = new PostgresLotteryProductResultRepository(database.pool);
    const item = {
      product: "dupla-sena" as const,
      contestNumber: 3014,
      drawDate: "2026-09-28",
      result: {
        family: "dual-number-draw" as const,
        draws: [[11, 20, 24, 25, 33, 49], [24, 26, 31, 35, 39, 43]] as [number[], number[]],
      },
      amountCollected: 2613570,
      source: {
        provider: "caixa" as const,
        endpoint: "https://servicebus2.caixa.gov.br/portaldeloterias/api/duplasena/3014",
      },
    };

    await repository.upsertMany([item]);
    await repository.upsertMany([{ ...item, amountCollected: undefined }]);

    const stored = await repository.findByNumber("dupla-sena", 3014);
    assert.equal(stored?.amountCollected, 2613570);
    assert.deepEqual(stored?.result, item.result);

    const status = await repository.getDataStatus("dupla-sena");
    assert.equal(status.resultCount, 1);
    assert.equal(status.firstContest, 3014);
    assert.equal(status.lastContest, 3014);
    assert.equal(status.internalMissingContestCount, 0);
    assert.ok(status.lastUpdatedAt);
  },
);
