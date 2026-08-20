import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Contest } from "../src/domain/types.js";
import { createPostgresPool } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrations.js";
import { PostgresContestRepository } from "../src/persistence/contestRepository.js";
import { createLotoLabServer } from "../src/api/server.js";

function makeContest(index: number): Contest {
  return {
    lottery: "mega-sena",
    number: index + 1,
    date: `2026-02-${String((index % 28) + 1).padStart(2, "0")}`,
    numbers: Array.from({ length: 6 }, (_, offset) => ((index * 4 + offset * 7) % 60) + 1)
      .sort((a, b) => a - b),
    prizeTiers: [
      { description: "6 acertos", winners: 0, prizeValue: 0 },
      { description: "5 acertos", winners: 4, prizeValue: 50000 },
      { description: "4 acertos", winners: 300, prizeValue: 900 },
    ],
  };
}

test(
  "Strategy Lab endpoint compares variants with PostgreSQL history",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const pool = createPostgresPool({ max: 4 });
    await runMigrations(pool);
    await pool.query(`
      TRUNCATE TABLE
        backtest_rounds,
        backtest_runs,
        generated_games,
        generated_game_batches,
        strategies,
        contest_prize_tiers,
        contests
      RESTART IDENTITY CASCADE
    `);
    await new PostgresContestRepository(pool).upsertMany(
      Array.from({ length: 18 }, (_, index) => makeContest(index)),
    );

    const server = createLotoLabServer({ pool, corsOrigin: "http://localhost:3000" });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    t.after(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await pool.end();
    });

    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const response = await fetch(`${baseUrl}/api/v1/lab/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lottery: "mega-sena",
        gameCount: 1,
        warmupContests: 5,
        lookbackContests: 10,
        bucketSize: 5,
      }),
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      startContest: number;
      endContest: number;
      rankingBasis: string;
      winner: string;
      variants: Array<{
        fixedCount: number;
        summary: { testedContests: number; financialCoverage: number };
        series: unknown[];
      }>;
    };

    assert.equal(payload.startContest, 9);
    assert.equal(payload.endContest, 18);
    assert.equal(payload.rankingBasis, "roi");
    assert.ok(payload.winner);
    assert.deepEqual(payload.variants.map((variant) => variant.fixedCount).sort((a, b) => a - b), [0, 2, 3]);
    assert.ok(payload.variants.every((variant) => variant.summary.testedContests === 10));
    assert.ok(payload.variants.every((variant) => variant.summary.financialCoverage === 1));
    assert.ok(payload.variants.every((variant) => variant.series.length === 2));
  },
);
