import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Contest } from "../src/domain/types.js";
import { createPostgresPool } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrations.js";
import { PostgresContestRepository } from "../src/persistence/contestRepository.js";
import { createLotoLabServer } from "../src/api/server.js";

function makeMegaContest(offset: number): Contest {
  const number = 2600 + offset;
  const numbers = Array.from({ length: 6 }, (_, index) => ((offset * 5 + index * 7) % 60) + 1)
    .sort((a, b) => a - b);

  return {
    lottery: "mega-sena",
    number,
    date: `2026-01-${String(offset + 1).padStart(2, "0")}`,
    numbers,
    prizeTiers: [
      { description: "6 acertos", winners: 0, prizeValue: 0 },
      { description: "5 acertos", winners: 10, prizeValue: 50000 },
      { description: "4 acertos", winners: 1000, prizeValue: 1000 },
    ],
  };
}

test(
  "HTTP API exposes contests, analysis, generation, checking, strategies, backtests and lab",
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

    const contests = Array.from({ length: 25 }, (_, index) => makeMegaContest(index));
    await new PostgresContestRepository(pool).upsertMany(contests);

    const server = createLotoLabServer({ pool, corsOrigin: "http://localhost:5173" });
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

    const health = await fetch(`${baseUrl}/health/ready`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok", database: "ready" });

    const listResponse = await fetch(`${baseUrl}/api/v1/contests/mega-sena?limit=3&order=desc`);
    assert.equal(listResponse.status, 200);
    const listed = (await listResponse.json()) as { items: Contest[] };
    assert.deepEqual(listed.items.map((contest) => contest.number), [2624, 2623, 2622]);
    assert.equal(listResponse.headers.get("access-control-allow-origin"), "http://localhost:5173");

    const latest = await fetch(`${baseUrl}/api/v1/contests/mega-sena/latest`);
    assert.equal(latest.status, 200);
    assert.equal(((await latest.json()) as Contest).number, 2624);

    const analysis = await fetch(`${baseUrl}/api/v1/analysis/mega-sena`);
    assert.equal(analysis.status, 200);
    const analysisBody = (await analysis.json()) as {
      numbers: Array<{ number: number; tier: string }>;
      tiers: { strong: number[]; balanced: number[]; cold: number[] };
    };
    assert.equal(analysisBody.numbers.length, 60);
    assert.equal(
      analysisBody.tiers.strong.length +
        analysisBody.tiers.balanced.length +
        analysisBody.tiers.cold.length,
      60,
    );

    const strategyResponse = await fetch(`${baseUrl}/api/v1/strategies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "mega-core-3",
        lottery: "mega-sena",
        name: "Mega 3 fixas",
        methodologyVersion: "1",
        config: { fixedCount: 3 },
      }),
    });
    assert.equal(strategyResponse.status, 201);

    const generateResponse = await fetch(`${baseUrl}/api/v1/games/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lottery: "mega-sena",
        gameCount: 2,
        targetContestNumber: 2624,
      }),
    });
    assert.equal(generateResponse.status, 201);
    const generated = (await generateResponse.json()) as {
      batchId: number;
      targetContestNumber: number;
      games: Array<{ numbers: number[] }>;
    };
    assert.ok(generated.batchId > 0);
    assert.equal(generated.targetContestNumber, 2624);
    assert.equal(generated.games.length, 2);
    assert.ok(generated.games.every((game) => game.numbers.length === 6));

    const checkResponse = await fetch(`${baseUrl}/api/v1/games/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batchId: generated.batchId,
        contestNumber: 2624,
      }),
    });
    assert.equal(checkResponse.status, 200);
    const checked = (await checkResponse.json()) as {
      checks: Array<{ ticketCost: number; hits: number }>;
    };
    assert.equal(checked.checks.length, 2);
    assert.ok(checked.checks.every((check) => check.ticketCost === 6));

    const backtestResponse = await fetch(`${baseUrl}/api/v1/backtests/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lottery: "mega-sena",
        gameCount: 2,
        warmupContests: 20,
        startContest: 2620,
        endContest: 2622,
      }),
    });
    assert.equal(backtestResponse.status, 201);
    const backtest = (await backtestResponse.json()) as {
      id: number;
      roundCount: number;
      summary: { testedContests: number; totalGames: number };
    };
    assert.ok(backtest.id > 0);
    assert.equal(backtest.roundCount, 3);
    assert.equal(backtest.summary.testedContests, 3);
    assert.equal(backtest.summary.totalGames, 6);

    const recentBacktests = await fetch(`${baseUrl}/api/v1/backtests/mega-sena?limit=5`);
    assert.equal(recentBacktests.status, 200);
    const recent = (await recentBacktests.json()) as {
      items: Array<{ id: number; roundCount: number }>;
    };
    assert.equal(recent.items[0]?.id, backtest.id);
    assert.equal(recent.items[0]?.roundCount, 3);

    const storedRun = await fetch(`${baseUrl}/api/v1/backtest-runs/${backtest.id}`);
    assert.equal(storedRun.status, 200);
    const stored = (await storedRun.json()) as { rounds: unknown[] };
    assert.equal(stored.rounds.length, 3);

    const labResponse = await fetch(`${baseUrl}/api/v1/lab/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lottery: "mega-sena",
        gameCount: 1,
        warmupContests: 15,
        lookbackContests: 10,
        bucketSize: 5,
      }),
    });
    assert.equal(labResponse.status, 200);
    const lab = (await labResponse.json()) as {
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
    assert.equal(lab.startContest, 2615);
    assert.equal(lab.endContest, 2624);
    assert.equal(lab.rankingBasis, "roi");
    assert.ok(lab.winner);
    assert.deepEqual(lab.variants.map((variant) => variant.fixedCount).sort((a, b) => a - b), [0, 2, 3]);
    assert.ok(lab.variants.every((variant) => variant.summary.testedContests === 10));
    assert.ok(lab.variants.every((variant) => variant.summary.financialCoverage === 1));
    assert.ok(lab.variants.every((variant) => variant.series.length === 2));

    const invalid = await fetch(`${baseUrl}/api/v1/contests/not-a-lottery`);
    assert.equal(invalid.status, 400);
  },
);
