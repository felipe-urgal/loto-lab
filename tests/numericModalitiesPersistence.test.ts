import test from "node:test";
import assert from "node:assert/strict";
import { PostgresContestRepository } from "../src/persistence/contestRepository.js";
import { PostgresGameRepository } from "../src/persistence/gameRepository.js";
import { createIsolatedPostgresDatabase } from "./helpers/postgres.js";

const databaseUrl = process.env.DATABASE_URL;

test(
  "numeric modalities persist Dupla Sena draws and Lotomania mirrors",
  { skip: !databaseUrl },
  async (t) => {
    const database = await createIsolatedPostgresDatabase({
      label: "numeric-modalities",
      max: 4,
    });
    t.after(() => database.close());

    const contests = new PostgresContestRepository(database.pool);
    await contests.upsertMany([
      {
        lottery: "dupla-sena",
        number: 3014,
        date: "2026-09-28",
        numbers: [11, 20, 24, 25, 33, 49],
        secondDrawNumbers: [24, 26, 31, 35, 39, 43],
        prizeTiers: [
          { description: "6 acertos", winners: 0, prizeValue: 0, draw: 1 },
          { description: "6 acertos", winners: 0, prizeValue: 0, draw: 2 },
        ],
      },
    ]);

    const storedContest = await contests.findByNumber("dupla-sena", 3014);
    assert.deepEqual(storedContest?.secondDrawNumbers, [24, 26, 31, 35, 39, 43]);
    assert.equal(storedContest?.prizeTiers?.filter((tier) => tier.draw === 1).length, 1);
    assert.equal(storedContest?.prizeTiers?.filter((tier) => tier.draw === 2).length, 1);

    const selected = Array.from({ length: 50 }, (_, index) => index * 2);
    const mirror = Array.from({ length: 50 }, (_, index) => index * 2 + 1);
    const games = new PostgresGameRepository(database.pool);
    const batch = await games.saveBatch({
      lottery: "lotomania",
      generatorOptions: { purpose: "uniform", betSize: 50 },
      games: [
        {
          lottery: "lotomania",
          numbers: selected,
          fixedNumbers: [],
          variableNumbers: selected,
          mirrorNumbers: mirror,
          metadata: {
            odd: 0,
            even: 50,
            sum: selected.reduce((sum, value) => sum + value, 0),
            repeatedFromLastContest: [],
          },
        },
      ],
    });

    assert.equal(batch.lottery, "lotomania");
    assert.deepEqual(batch.games[0]?.mirrorNumbers, mirror);
  },
);
