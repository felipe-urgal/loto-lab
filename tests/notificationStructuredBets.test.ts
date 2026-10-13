import assert from "node:assert/strict";
import test from "node:test";
import type { GeneratedGame, LotteryId } from "../src/domain/types.js";
import { NotificationService } from "../src/notifications/service.js";
import { PostgresGameRepository } from "../src/persistence/gameRepository.js";
import { PostgresNotificationRepository } from "../src/persistence/notificationRepository.js";
import { RealBetService } from "../src/realBets/service.js";
import { createIsolatedPostgresDatabase } from "./helpers/postgres.js";

const metadata = { odd: 0, even: 0, sum: 0, repeatedFromLastContest: [] };
const cases: Array<{ lottery: LotteryId; game: GeneratedGame }> = [
  {
    lottery: "mais-milionaria",
    game: { lottery: "mais-milionaria", numbers: [1,2,3,4,5,6],
      fixedNumbers: [], variableNumbers: [1,2,3,4,5,6],
      secondary: { kind: "clovers", values: [1,2] }, metadata },
  },
  {
    lottery: "timemania",
    game: { lottery: "timemania", numbers: [1,2,3,4,5,6,7,8,9,10],
      fixedNumbers: [], variableNumbers: [1,2,3,4,5,6,7,8,9,10],
      secondary: { kind: "favorite-team", values: ["SANTOS"] }, metadata },
  },
  {
    lottery: "super-sete",
    game: { lottery: "super-sete", numbers: [], fixedNumbers: [], variableNumbers: [],
      columns: [[1],[2],[3],[4],[5],[6],[7]], metadata },
  },
];

test("nine-lottery notifications preserve unknown payout, reopen official payout, and use one batched contest query",
  { skip: !process.env.DATABASE_URL, timeout: 30_000 }, async () => {
  const db = await createIsolatedPostgresDatabase({ label: "notification-341", max: 5 });
  const { pool } = db;
  try {
    const bets = new RealBetService(pool);
    const games = new PostgresGameRepository(pool);
    const notifications = new PostgresNotificationRepository(pool);
    const ids: number[] = [];
    for (const [index, entry] of cases.entries()) {
      const batch = await games.saveBatch({
        lottery: entry.lottery, targetContestNumber: 998001 + index,
        generatorOptions: { test: "notification-341" }, games: [entry.game],
      });
      const bet = await bets.create({
        batchId: batch.id, actualCost: 6, playedAt: "2098-12-31T12:00:00Z",
      });
      ids.push(bet.id);
    }
    let batchedLookups = 0;
    const originalQuery = pool.query.bind(pool);
    // Count the batch lookup on the Pool; the prior N+1 implementation used
    // a separate contest lookup per pending bet.
    const observed = pool as typeof pool & { query: typeof pool.query };
    const prior = observed.query;
    observed.query = ((...args: Parameters<typeof pool.query>) => {
      if (typeof args[0] === "string" && args[0].includes("JOIN unnest(")) batchedLookups++;
      return (originalQuery as (...items: typeof args) => ReturnType<typeof pool.query>)(...args);
    }) as typeof pool.query;
    try {
      await new NotificationService(pool).refresh();
    } finally {
      observed.query = prior;
    }
    assert.equal(batchedLookups, 1);

    for (const id of ids) {
      const row = (await notifications.list()).find(item => item.eventKey === `bet:${id}`);
      assert.equal(row?.type, "bet-awaiting");
      await pool.query("UPDATE real_bets SET status = 'checked', total_prize_value = NULL WHERE id = $1", [id]);
    }
    await new NotificationService(pool).refresh();
    for (const id of ids) {
      const row = (await notifications.list()).find(item => item.eventKey === `bet:${id}`);
      assert.equal(row?.type, "bet-checked");
      assert.match(row!.body, /premia[cç][aã]o ainda n[aã]o dispon[ií]vel/i);
      assert.doesNotMatch(row!.body, /sem pr[eê]mio/i);
      await notifications.markRead(row!.id);
    }
    await pool.query("UPDATE real_bets SET total_prize_value = 0 WHERE id = $1", [ids[0]]);
    await pool.query("UPDATE real_bets SET total_prize_value = 12 WHERE id = $1", [ids[1]]);
    await pool.query("UPDATE real_bets SET total_prize_value = 25 WHERE id = $1", [ids[2]]);
    await new NotificationService(pool).refresh();
    for (const [index, id] of ids.entries()) {
      const rows = (await notifications.list()).filter(item => item.eventKey === `bet:${id}`);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.readAt, undefined);
      assert.equal(rows[0]?.type, index === 0 ? "bet-checked" : "bet-prize");
      if (index === 0) assert.match(rows[0]!.body, /sem pr[eê]mio/i);
    }
    await new NotificationService(pool).refresh();
    for (const id of ids) {
      const rows = (await notifications.list()).filter(item => item.eventKey === `bet:${id}`);
      assert.equal(rows.length, 1);
    }
  } finally {
    await db.close();
  }
});
