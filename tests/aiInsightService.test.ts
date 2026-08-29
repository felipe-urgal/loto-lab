import test from "node:test";
import assert from "node:assert/strict";
import { AiInsightService } from "../src/ai/service.js";
import type {
  AiInterpretationProvider,
  AiInterpretationRequest,
  AiProviderResult,
} from "../src/ai/types.js";
import type { Contest } from "../src/domain/types.js";
import { createPostgresPool } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrations.js";
import { PostgresContestRepository } from "../src/persistence/contestRepository.js";

const databaseUrl = process.env.DATABASE_URL;

function insightResult(model: string, suffix: string): AiProviderResult {
  return {
    model,
    providerResponseId: `response-${suffix}`,
    insight: {
      headline: `Headline ${suffix}`,
      summary: `Summary ${suffix}`,
      observations: [`Observation ${suffix}`],
      risks: [`Risk ${suffix}`],
      nextTests: [`Next ${suffix}`],
    },
    usage: { inputTokens: 10, outputTokens: 5 },
  };
}

function megaContest(number: number): Contest {
  return {
    lottery: "mega-sena",
    number,
    date: "2026-08-29",
    numbers: [1, 7, 13, 29, 42, 60],
    prizeTiers: [
      { description: "6 acertos", winners: 0, prizeValue: 0 },
      { description: "5 acertos", winners: 10, prizeValue: 50_000 },
      { description: "4 acertos", winners: 1_000, prizeValue: 1_000 },
    ],
  };
}

class TestProvider implements AiInterpretationProvider {
  readonly name = "test-provider";
  readonly modelName = "test-model";
  calls = 0;
  interpretImpl: (request: AiInterpretationRequest) => Promise<AiProviderResult>;

  constructor() {
    this.interpretImpl = async () => insightResult(this.modelName, String(this.calls));
  }

  isConfigured(): boolean {
    return true;
  }

  model(): string {
    return this.modelName;
  }

  async interpret(request: AiInterpretationRequest): Promise<AiProviderResult> {
    this.calls += 1;
    return this.interpretImpl(request);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test(
  "AI insight service deduplicates semantic evidence, shares in-flight work, honors force and recovers from provider failures",
  { skip: !databaseUrl, timeout: 20_000 },
  async (t) => {
    const pool = createPostgresPool({ connectionString: databaseUrl!, max: 4 });
    await runMigrations(pool);
    await pool.query(`
      TRUNCATE TABLE
        ai_insights,
        analysis_jobs,
        backtest_rounds,
        backtest_runs,
        real_bet_financial_revisions,
        real_bet_games,
        real_bets,
        generated_games,
        generated_game_batches,
        contest_prize_tiers,
        contests
      RESTART IDENTITY CASCADE
    `);
    t.after(async () => pool.end());

    await new PostgresContestRepository(pool).upsertMany([megaContest(3000)]);
    await pool.query(
      `
        INSERT INTO backtest_runs (lottery, options, summary, tested_contests, total_games)
        VALUES ('mega-sena', $1::jsonb, $2::jsonb, 1, 1)
      `,
      [JSON.stringify({ gameCount: 1, warmupContests: 20 }), JSON.stringify({ averageHitsPerGame: 1.5 })],
    );
    const labResult = {
      schemaVersion: 2,
      lottery: "mega-sena",
      experiment: "fixed-core",
      startContest: 2990,
      endContest: 3000,
      gameCount: 1,
      warmupContests: 20,
      bucketSize: 5,
      randomSamples: 100,
      rankingBasis: "roi",
      winner: "core-3",
      benchmark: {
        status: "inconclusive",
        basis: "roi",
        adjustedPValue: 0.4,
        lowerAdjustedPValue: 0.7,
        strategyPercentile: 0.65,
        resolutionSufficient: true,
        sampleSizeSufficient: false,
        observationRounds: 11,
        minimumObservationRounds: 30,
        familySize: 3,
      },
      variants: [{
        key: "core-3",
        label: "3 fixas",
        fixedCount: 3,
        summary: {
          averageHitsPerGame: 1.5,
          averageFixedHitsPerContest: 0.8,
          maxHits: 4,
          prizeRate: 0.1,
          roi: -0.5,
          financialCoverage: 1,
          netResult: -30,
        },
        series: [],
      }],
    };
    await pool.query(
      `
        INSERT INTO analysis_jobs (kind, lottery, status, input, result, finished_at)
        VALUES ('strategy-lab', 'mega-sena', 'completed', '{}'::jsonb, $1::jsonb, NOW())
      `,
      [JSON.stringify(labResult)],
    );

    const provider = new TestProvider();
    const service = new AiInsightService(pool, provider);
    assert.deepEqual(service.status(), {
      provider: "test-provider",
      configured: true,
      model: "test-model",
    });

    const first = await service.generate("mega-sena", "overview");
    assert.equal(provider.calls, 1);
    assert.ok(first.evidenceHash);
    assert.equal(first.reused, undefined);
    assert.equal(first.evidence.latestContest?.number, 3000);
    assert.ok(first.evidence.latestBacktest?.id);
    assert.equal(first.evidence.strategyLab?.bestInPeriod, "core-3");
    assert.equal(first.evidence.strategyLab?.benchmark.status, "inconclusive");
    assert.equal(first.evidence.strategyLab?.variants[0]?.fixedCount, 3);

    await delay(5);
    const cached = await service.generate("mega-sena", "overview");
    assert.equal(provider.calls, 1);
    assert.equal(cached.id, first.id);
    assert.equal(cached.evidenceHash, first.evidenceHash);
    assert.equal(cached.reused, true);

    let releaseInterpretation!: () => void;
    let markInterpretationStarted!: () => void;
    const interpretationStarted = new Promise<void>((resolve) => {
      markInterpretationStarted = resolve;
    });
    const interpretationRelease = new Promise<void>((resolve) => {
      releaseInterpretation = resolve;
    });
    provider.interpretImpl = async () => {
      markInterpretationStarted();
      await interpretationRelease;
      return insightResult(provider.modelName, "shared");
    };

    const beforeConcurrentCalls = provider.calls;
    const concurrentFirst = service.generate("mega-sena", "analysis");
    await interpretationStarted;
    const concurrentSecond = service.generate("mega-sena", "analysis");
    try {
      await delay(25);
      assert.equal(provider.calls, beforeConcurrentCalls + 1);
    } finally {
      releaseInterpretation();
    }

    const [sharedFirst, sharedSecond] = await Promise.all([concurrentFirst, concurrentSecond]);
    assert.equal(sharedSecond.id, sharedFirst.id);
    assert.equal(sharedSecond.reused, true);

    provider.interpretImpl = async () => insightResult(provider.modelName, `force-${provider.calls}`);
    const beforeForceCalls = provider.calls;
    const forcedFirst = await service.generate("mega-sena", "strategy", true);
    const forcedSecond = await service.generate("mega-sena", "strategy", true);
    assert.equal(provider.calls, beforeForceCalls + 2);
    assert.notEqual(forcedFirst.id, forcedSecond.id);
    assert.equal(forcedFirst.evidenceHash, undefined);
    assert.equal(forcedSecond.evidenceHash, undefined);
    assert.equal(forcedFirst.reused, undefined);
    assert.equal(forcedSecond.reused, undefined);

    provider.interpretImpl = async () => {
      throw new Error("provider unavailable for test");
    };
    const beforeFailureCalls = provider.calls;
    await assert.rejects(
      () => service.generate("mega-sena", "real-performance"),
      /provider unavailable for test/,
    );
    assert.equal(provider.calls, beforeFailureCalls + 1);
    assert.equal((await service.history("mega-sena", 20)).filter((row) => row.focus === "real-performance").length, 0);

    provider.interpretImpl = async () => insightResult(provider.modelName, "recovered");
    const recovered = await service.generate("mega-sena", "real-performance");
    assert.ok(recovered.id > 0);
    assert.ok(recovered.evidenceHash);
    assert.equal(provider.calls, beforeFailureCalls + 2);

    const history = await service.history("mega-sena", 20);
    assert.equal(history.length, 5);
    assert.equal(history.filter((row) => row.focus === "overview").length, 1);
    assert.equal(history.filter((row) => row.focus === "analysis").length, 1);
    assert.equal(history.filter((row) => row.focus === "strategy").length, 2);
    assert.equal(history.filter((row) => row.focus === "real-performance").length, 1);
  },
);
