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

function gameFingerprint(games: Array<{ numbers: number[] }>): string {
  return games.map((game) => game.numbers.join("-")).sort().join("|");
}

test(
  "HTTP API exposes contests, analysis, diversified generation, real bets, checking, strategies, backtests and lab",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const pool = createPostgresPool({ max: 4 });
    await runMigrations(pool);
    await pool.query(`
      TRUNCATE TABLE
        real_bet_games,
        real_bets,
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
      generatorOptions: { generationMode: string; seed: string };
    };
    assert.ok(generated.batchId > 0);
    assert.equal(generated.targetContestNumber, 2624);
    assert.equal(generated.games.length, 2);
    assert.ok(generated.games.every((game) => game.numbers.length === 6));
    assert.equal(generated.generatorOptions.generationMode, "diversified");
    assert.ok(generated.generatorOptions.seed.length > 8);

    const secondGenerateResponse = await fetch(`${baseUrl}/api/v1/games/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lottery: "mega-sena",
        gameCount: 2,
        targetContestNumber: 2624,
      }),
    });
    assert.equal(secondGenerateResponse.status, 201);
    const secondGenerated = (await secondGenerateResponse.json()) as {
      batchId: number;
      games: Array<{ numbers: number[] }>;
      generatorOptions: { generationMode: string; seed: string };
    };
    assert.notEqual(secondGenerated.batchId, generated.batchId);
    assert.notEqual(gameFingerprint(secondGenerated.games), gameFingerprint(generated.games));
    assert.notEqual(secondGenerated.generatorOptions.seed, generated.generatorOptions.seed);

    const replayResponse = await fetch(`${baseUrl}/api/v1/games/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lottery: "mega-sena",
        gameCount: 2,
        targetContestNumber: 2624,
        generationMode: "diversified",
        seed: generated.generatorOptions.seed,
        persist: false,
      }),
    });
    assert.equal(replayResponse.status, 200);
    const replay = (await replayResponse.json()) as { games: Array<{ numbers: number[] }> };
    assert.equal(gameFingerprint(replay.games), gameFingerprint(generated.games));

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

    const realBetResponse = await fetch(`${baseUrl}/api/v1/real-bets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batchId: generated.batchId,
        contestNumber: 2624,
        gamePositions: [1],
        actualCost: 6,
        playedAt: "2026-01-25T12:00:00.000Z",
      }),
    });
    assert.equal(realBetResponse.status, 201);
    const realBet = (await realBetResponse.json()) as {
      id: number;
      batchId: number;
      status: string;
      actualCost: number;
      totalPrizeValue: number;
      netResult: number;
      games: Array<{ batchPosition: number; checkResult?: { hits: number } }>;
    };
    assert.ok(realBet.id > 0);
    assert.equal(realBet.batchId, generated.batchId);
    assert.equal(realBet.status, "checked");
    assert.equal(realBet.actualCost, 6);
    assert.equal(realBet.games.length, 1);
    assert.equal(realBet.games[0]?.batchPosition, 1);
    assert.ok(realBet.games[0]?.checkResult);
    assert.equal(realBet.netResult, realBet.totalPrizeValue - 6);

    const realBetList = await fetch(`${baseUrl}/api/v1/real-bets/mega-sena?limit=5`);
    assert.equal(realBetList.status, 200);
    const realBetData = (await realBetList.json()) as {
      items: Array<{ id: number; status: string }>;
      summary: {
        totalBets: number;
        checkedBets: number;
        pendingBets: number;
        actualCost: number;
        checkedCost: number;
      };
    };
    assert.equal(realBetData.items[0]?.id, realBet.id);
    assert.equal(realBetData.items[0]?.status, "checked");
    assert.equal(realBetData.summary.totalBets, 1);
    assert.equal(realBetData.summary.checkedBets, 1);
    assert.equal(realBetData.summary.pendingBets, 0);
    assert.equal(realBetData.summary.actualCost, 6);
    assert.equal(realBetData.summary.checkedCost, 6);

    const duplicateRealBet = await fetch(`${baseUrl}/api/v1/real-bets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId: generated.batchId, contestNumber: 2624, actualCost: 12 }),
    });
    assert.equal(duplicateRealBet.status, 409);

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
    const stored = (await storedRun.json()) as { rounds: Array<Record<string, unknown>> };
    assert.equal(stored.rounds.length, 3);
    for (const round of stored.rounds) {
      assert.ok(Array.isArray(round.targetNumbers));
      assert.ok(Array.isArray(round.hitsByGame));
      assert.equal("generatedGames" in round, false);
      assert.equal("checks" in round, false);
    }

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
