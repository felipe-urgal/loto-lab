import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCaixaContest } from "../src/data/caixa.js";
import type { GeneratedGame, LotteryId } from "../src/domain/types.js";
import {
  assertValidContestNumbers,
  assertValidGeneratedGame,
} from "../src/domain/validation.js";
import { PostgresGameRepository } from "../src/persistence/gameRepository.js";
import { PostgresRealBetRepository } from "../src/persistence/realBetRepository.js";
import { PostgresStrategyRepository } from "../src/persistence/strategyRepository.js";
import { createIsolatedPostgresDatabase } from "./helpers/postgres.js";

const databaseUrl = process.env.DATABASE_URL;

function metadata(numbers: number[]): GeneratedGame["metadata"] {
  const odd = numbers.filter((number) => number % 2 !== 0).length;
  return {
    odd,
    even: numbers.length - odd,
    sum: numbers.reduce((total, number) => total + number, 0),
    repeatedFromLastContest: [],
  };
}

function game(
  lottery: LotteryId,
  numbers: number[],
  fixedNumbers: number[],
  variableNumbers: number[],
  luckyMonth?: string,
): GeneratedGame {
  return {
    lottery,
    numbers,
    fixedNumbers,
    variableNumbers,
    ...(luckyMonth !== undefined ? { luckyMonth } : {}),
    metadata: metadata(numbers),
  };
}

const validGames: GeneratedGame[] = [
  game("mega-sena", [1, 2, 3, 4, 5, 60], [1, 2, 3], [4, 5, 60]),
  game(
    "lotofacil",
    Array.from({ length: 15 }, (_, index) => index + 1),
    Array.from({ length: 8 }, (_, index) => index + 1),
    Array.from({ length: 7 }, (_, index) => index + 9),
  ),
  game("dia-de-sorte", [1, 2, 3, 4, 5, 6, 31], [1, 2, 3], [4, 5, 6, 31], "Janeiro"),
];

const invalidGames: Array<{ label: string; value: GeneratedGame }> = [
  {
    label: "Mega-Sena fixed count outside the supported contract",
    value: game("mega-sena", [1, 2, 3, 4, 5, 6], [1], [2, 3, 4, 5, 6]),
  },
  {
    label: "Lotofácil number outside its lottery range",
    value: game(
      "lotofacil",
      [...Array.from({ length: 14 }, (_, index) => index + 1), 26],
      Array.from({ length: 8 }, (_, index) => index + 1),
      [...Array.from({ length: 6 }, (_, index) => index + 9), 26],
    ),
  },
  {
    label: "Dia de Sorte without Mês da Sorte",
    value: game("dia-de-sorte", [1, 2, 3, 4, 5, 6, 7], [1, 2, 3], [4, 5, 6, 7]),
  },
  {
    label: "Mega-Sena carrying a Mês da Sorte",
    value: game("mega-sena", [1, 2, 3, 4, 5, 6], [1, 2, 3], [4, 5, 6], "Janeiro"),
  },
  {
    label: "overlapping fixed and variable partitions",
    value: game("mega-sena", [1, 2, 3, 4, 5, 6], [1, 2, 3], [3, 4, 5]),
  },
];

async function insertRawGame(
  pool: Awaited<ReturnType<typeof createIsolatedPostgresDatabase>>["pool"],
  value: GeneratedGame,
): Promise<void> {
  const batch = await pool.query<{ id: string }>(
    `
      INSERT INTO generated_game_batches (lottery, generator_options)
      VALUES ($1, '{}'::jsonb)
      RETURNING id
    `,
    [value.lottery],
  );
  await pool.query(
    `
      INSERT INTO generated_games (
        batch_id, position, numbers, fixed_numbers, variable_numbers, lucky_month, metadata
      ) VALUES ($1, 1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      Number(batch.rows[0]!.id),
      value.numbers,
      value.fixedNumbers,
      value.variableNumbers,
      value.luckyMonth ?? null,
      JSON.stringify(value.metadata),
    ],
  );
}

test(
  "contest and generated-game invariants agree between TypeScript and PostgreSQL",
  { skip: !databaseUrl },
  async (t) => {
    const database = await createIsolatedPostgresDatabase({ label: "domain-db-contracts", max: 4 });
    const { pool } = database;
    t.after(async () => database.close());

    const validContests: Array<{ lottery: LotteryId; numbers: number[] }> = [
      { lottery: "mega-sena", numbers: [1, 2, 3, 4, 5, 60] },
      { lottery: "lotofacil", numbers: Array.from({ length: 15 }, (_, index) => index + 1) },
      { lottery: "dia-de-sorte", numbers: [1, 2, 3, 4, 5, 6, 31] },
    ];

    let contestNumber = 900_000;
    for (const fixture of validContests) {
      assert.doesNotThrow(() => assertValidContestNumbers(fixture.lottery, fixture.numbers));
      await pool.query(
        `
          INSERT INTO contests (lottery, contest_number, draw_date, numbers)
          VALUES ($1, $2, '2099-01-01', $3)
        `,
        [fixture.lottery, contestNumber++, fixture.numbers],
      );
    }

    const invalidContests: Array<{ lottery: LotteryId; numbers: number[] }> = [
      { lottery: "mega-sena", numbers: [1, 1, 2, 3, 4, 5] },
      { lottery: "lotofacil", numbers: [...Array.from({ length: 14 }, (_, index) => index + 1), 26] },
      { lottery: "dia-de-sorte", numbers: [1, 2, 3, 4, 5, 6] },
    ];

    for (const fixture of invalidContests) {
      assert.throws(() => assertValidContestNumbers(fixture.lottery, fixture.numbers));
      await assert.rejects(
        () => pool.query(
          `
            INSERT INTO contests (lottery, contest_number, draw_date, numbers)
            VALUES ($1, $2, '2099-01-01', $3)
          `,
          [fixture.lottery, contestNumber++, fixture.numbers],
        ),
      );
    }

    const impossibleDatePayload = {
      numero: contestNumber++,
      dataApuracao: "31/02/2099",
      listaDezenas: ["01", "02", "03", "04", "05", "06"],
    };
    assert.throws(
      () => normalizeCaixaContest("mega-sena", impossibleDatePayload),
      /Invalid Caixa date: 31\/02\/2099/,
    );
    await assert.rejects(
      () => pool.query(
        `
          INSERT INTO contests (lottery, contest_number, draw_date, numbers)
          VALUES ('mega-sena', $1, $2, $3)
        `,
        [contestNumber++, "2099-02-31", [1, 2, 3, 4, 5, 6]],
      ),
    );

    for (const fixture of validGames) {
      assert.doesNotThrow(() => assertValidGeneratedGame(fixture));
      await insertRawGame(pool, fixture);
    }

    for (const fixture of invalidGames) {
      assert.throws(
        () => assertValidGeneratedGame(fixture.value),
        undefined,
        fixture.label,
      );
      await assert.rejects(
        () => insertRawGame(pool, fixture.value),
        undefined,
        fixture.label,
      );
    }
  },
);

test(
  "real-bet cost and game contracts reject invalid input before and inside PostgreSQL",
  { skip: !databaseUrl },
  async (t) => {
    const database = await createIsolatedPostgresDatabase({ label: "real-bet-contracts", max: 4 });
    const { pool } = database;
    t.after(async () => database.close());

    const games = new PostgresGameRepository(pool);
    const batch = await games.saveBatch({
      lottery: "mega-sena",
      targetContestNumber: 700_001,
      generatorOptions: { contract: true },
      games: [validGames[0]!],
    });
    const realBets = new PostgresRealBetRepository(pool);
    const input = {
      batchId: batch.id,
      lottery: "mega-sena" as const,
      contestNumber: 700_001,
      playedAt: "2099-01-01T12:00:00.000Z",
      games: [{ batchPosition: 1, game: validGames[0]! }],
    };

    await assert.rejects(
      () => realBets.create({ ...input, actualCost: 0 }),
      /actualCost must be a positive number/,
    );

    await assert.rejects(
      () => pool.query(
        `
          INSERT INTO real_bets (
            batch_id, lottery, contest_number, status, actual_cost, played_at
          ) VALUES ($1, 'mega-sena', 700001, 'awaiting_result', 0, NOW())
        `,
        [batch.id],
      ),
    );

    const created = await realBets.create({ ...input, actualCost: 6 });
    assert.equal(created.actualCost, 6);
    assert.equal(created.games.length, 1);
  },
);

test(
  "strategy lottery and historical versions are immutable in application and PostgreSQL",
  { skip: !databaseUrl },
  async (t) => {
    const database = await createIsolatedPostgresDatabase({ label: "strategy-contracts", max: 4 });
    const { pool } = database;
    t.after(async () => database.close());

    const strategies = new PostgresStrategyRepository(pool);
    const first = await strategies.upsert({
      slug: "contract-mega",
      lottery: "mega-sena",
      name: "Contract Mega",
      methodologyVersion: "v1",
      config: { fixedCount: 3 },
    });

    await assert.rejects(
      () => strategies.upsert({
        slug: "contract-mega",
        lottery: "lotofacil",
        name: "Contract Mega",
        methodologyVersion: "v2",
        config: { fixedCount: 8 },
      }),
      /STRATEGY_LOTTERY_IMMUTABLE/,
    );

    await assert.rejects(
      () => pool.query(
        "UPDATE strategies SET lottery = 'lotofacil' WHERE id = $1",
        [first.id],
      ),
      /Strategy lottery is immutable/,
    );

    const second = await strategies.upsert({
      slug: "contract-mega",
      lottery: "mega-sena",
      name: "Contract Mega v2",
      methodologyVersion: "v2",
      config: { fixedCount: 2 },
    });
    assert.equal(second.version, 2);

    const versions = await strategies.listVersions(first.id);
    assert.deepEqual(versions.map((version) => version.version), [2, 1]);
    const versionOne = versions.find((version) => version.version === 1)!;
    assert.deepEqual(versionOne.config, { fixedCount: 3 });

    await assert.rejects(
      () => pool.query(
        "UPDATE strategy_versions SET config = '{\"fixedCount\": 0}'::jsonb WHERE id = $1",
        [versionOne.id],
      ),
      /Strategy versions are immutable/,
    );

    assert.deepEqual((await strategies.findVersionById(versionOne.id))?.config, { fixedCount: 3 });
  },
);
