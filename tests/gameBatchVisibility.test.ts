import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createLotoLabServer } from "../src/api/server.js";
import { createPostgresPool } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrations.js";

test(
  "a batch with a real bet can be hidden and shown without deleting history",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const pool = createPostgresPool({ max: 3 });
    await runMigrations(pool);
    await pool.query(`
      TRUNCATE TABLE
        real_bet_games,
        real_bets,
        generated_games,
        generated_game_batches
      RESTART IDENTITY CASCADE
    `);

    const batchResult = await pool.query<{ id: string }>(`
      INSERT INTO generated_game_batches (lottery, target_contest_number, generator_options)
      VALUES ('mega-sena', 3048, '{}'::jsonb)
      RETURNING id
    `);
    const batchId = Number(batchResult.rows[0]!.id);

    await pool.query(
      `
        INSERT INTO generated_games (
          batch_id, position, numbers, fixed_numbers, variable_numbers, metadata
        ) VALUES ($1, 1, $2, $3, $4, '{}'::jsonb)
      `,
      [batchId, [1, 2, 3, 4, 5, 6], [1, 2, 3], [4, 5, 6]],
    );
    await pool.query(
      `
        INSERT INTO real_bets (
          batch_id, lottery, contest_number, status, actual_cost, played_at
        ) VALUES ($1, 'mega-sena', 3048, 'placed', 6, NOW())
      `,
      [batchId],
    );

    const server = createLotoLabServer({ pool });
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

    const hide = await fetch(`${baseUrl}/api/v1/game-batches/${batchId}/hide`, { method: "POST" });
    assert.equal(hide.status, 200);
    const hidden = (await hide.json()) as { id: number; archivedAt?: string; hasRealBet: boolean };
    assert.equal(hidden.id, batchId);
    assert.equal(hidden.hasRealBet, true);
    assert.ok(hidden.archivedAt);

    const managed = await fetch(`${baseUrl}/api/v1/game-batches/manage/mega-sena?scope=all&limit=20`);
    assert.equal(managed.status, 200);
    const managedBody = (await managed.json()) as {
      items: Array<{ id: number; archivedAt?: string; hasRealBet: boolean }>;
      counts: { active: number; archived: number; realBets: number };
    };
    assert.equal(managedBody.items[0]?.id, batchId);
    assert.equal(managedBody.items[0]?.hasRealBet, true);
    assert.ok(managedBody.items[0]?.archivedAt);
    assert.deepEqual(managedBody.counts, { active: 0, archived: 1, realBets: 1 });

    const show = await fetch(`${baseUrl}/api/v1/game-batches/${batchId}/show`, { method: "POST" });
    assert.equal(show.status, 200);
    const shown = (await show.json()) as { id: number; archivedAt?: string; hasRealBet: boolean };
    assert.equal(shown.id, batchId);
    assert.equal(shown.hasRealBet, true);
    assert.equal(shown.archivedAt, undefined);

    const active = await fetch(`${baseUrl}/api/v1/game-batches/manage/mega-sena?scope=active&limit=20`);
    assert.equal(active.status, 200);
    const activeBody = (await active.json()) as { items: Array<{ id: number; archivedAt?: string }> };
    assert.equal(activeBody.items.length, 1);
    assert.equal(activeBody.items[0]?.id, batchId);
    assert.equal(activeBody.items[0]?.archivedAt, undefined);
  },
);
