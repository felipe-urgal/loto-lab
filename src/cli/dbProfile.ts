import type { LotteryId } from "../domain/types.js";
import { createPostgresPool } from "../db/client.js";

const LOTTERIES: LotteryId[] = ["mega-sena", "lotofacil", "dia-de-sorte"];
const requested = process.argv[2] ?? "mega-sena";
if (!LOTTERIES.includes(requested as LotteryId)) {
  throw new Error(`Unknown lottery: ${requested}`);
}
const lottery = requested as LotteryId;

const profiles = [
  {
    name: "latest contest",
    sql: `SELECT id, contest_number, draw_date FROM contests WHERE lottery = $1 ORDER BY contest_number DESC LIMIT 1`,
  },
  {
    name: "active recent batches",
    sql: `SELECT id, created_at FROM generated_game_batches WHERE lottery = $1 AND archived_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 20`,
  },
  {
    name: "recent backtests",
    sql: `SELECT id, created_at FROM backtest_runs WHERE lottery = $1 ORDER BY created_at DESC LIMIT 20`,
  },
  {
    name: "recent real bets",
    sql: `SELECT id, contest_number, created_at FROM real_bets WHERE lottery = $1 ORDER BY contest_number DESC, created_at DESC LIMIT 20`,
  },
];

const pool = createPostgresPool({ max: 1 });
try {
  console.log(`Database hot-path profile · ${lottery}`);
  for (const profile of profiles) {
    const result = await pool.query<{ "QUERY PLAN": string }>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${profile.sql}`,
      [lottery],
    );
    console.log(`\n## ${profile.name}`);
    for (const row of result.rows) console.log(row["QUERY PLAN"]);
  }
} finally {
  await pool.end();
}
