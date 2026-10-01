import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createLotoLabServer } from "../src/api/server.js";
import { createIsolatedPostgresDatabase } from "./helpers/postgres.js";

type PreviewResponse = {
  games: Array<{
    numbers: number[];
    secondary?: { kind: string; values: Array<string | number> };
    columns?: number[][];
  }>;
  generatorOptions: {
    seed: string;
    betQuote?: { simpleEquivalentCount: number; totalPriceCents: number };
  };
};

async function post(baseUrl: string, path: string, body: Record<string, unknown>) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test(
  "structured modalities flow through HTTP preview and persistence without flattening fields",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const database = await createIsolatedPostgresDatabase({ label: "structured-api", max: 4 });
    const { pool } = database;
    const server = createLotoLabServer({ pool });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    t.after(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await database.close();
    });

    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const cases = [
      {
        lottery: "mais-milionaria",
        input: {
          lottery: "mais-milionaria",
          gameCount: 1,
          fixedCount: 0,
          betSize: 8,
          cloverCount: 4,
          purpose: "uniform",
        },
        verify(preview: PreviewResponse) {
          assert.equal(preview.games[0]?.numbers.length, 8);
          assert.equal(preview.games[0]?.secondary?.kind, "clovers");
          assert.equal(preview.games[0]?.secondary?.values.length, 4);
          assert.equal(preview.generatorOptions.betQuote?.simpleEquivalentCount, 168);
          assert.equal(preview.generatorOptions.betQuote?.totalPriceCents, 100800);
        },
      },
      {
        lottery: "timemania",
        input: {
          lottery: "timemania",
          gameCount: 1,
          fixedCount: 0,
          favoriteTeam: "SANTOS /SP",
          purpose: "uniform",
        },
        verify(preview: PreviewResponse) {
          assert.equal(preview.games[0]?.numbers.length, 10);
          assert.deepEqual(preview.games[0]?.secondary, {
            kind: "favorite-team",
            values: ["SANTOS /SP"],
          });
          assert.equal(preview.generatorOptions.betQuote?.totalPriceCents, 350);
        },
      },
      {
        lottery: "super-sete",
        input: {
          lottery: "super-sete",
          gameCount: 1,
          fixedCount: 0,
          columnMarks: [2, 1, 2, 1, 2, 1, 2],
          purpose: "uniform",
        },
        verify(preview: PreviewResponse) {
          assert.deepEqual(preview.games[0]?.numbers, []);
          assert.deepEqual(
            preview.games[0]?.columns?.map((column) => column.length),
            [2, 1, 2, 1, 2, 1, 2],
          );
          assert.equal(preview.generatorOptions.betQuote?.simpleEquivalentCount, 16);
          assert.equal(preview.generatorOptions.betQuote?.totalPriceCents, 4800);
        },
      },
    ] as const;

    for (const item of cases) {
      const previewResponse = await post(baseUrl, "/api/v1/generation/preview", item.input);
      assert.equal(previewResponse.status, 200, `${item.lottery} preview failed`);
      const preview = (await previewResponse.json()) as PreviewResponse;
      item.verify(preview);
      assert.ok(preview.generatorOptions.seed.length > 8);

      const saveResponse = await post(baseUrl, "/api/v1/generation/save", {
        ...item.input,
        seed: preview.generatorOptions.seed,
      });
      assert.equal(saveResponse.status, 201, `${item.lottery} save failed`);
      const saved = (await saveResponse.json()) as {
        batchId: number;
        games: PreviewResponse["games"];
      };
      assert.ok(saved.batchId > 0);
      assert.deepEqual(saved.games, preview.games);
    }

    const persisted = await pool.query<{
      lottery: string;
      secondary_selection: unknown;
      columns: unknown;
    }>(
      `
        SELECT batch.lottery, game.secondary_selection, game.columns
        FROM generated_game_batches batch
        JOIN generated_games game ON game.batch_id = batch.id
        WHERE batch.lottery IN ('mais-milionaria', 'timemania', 'super-sete')
        ORDER BY batch.lottery
      `,
    );
    assert.equal(persisted.rows.length, 3);
    assert.ok(persisted.rows.find((row) => row.lottery === "mais-milionaria")?.secondary_selection);
    assert.ok(persisted.rows.find((row) => row.lottery === "timemania")?.secondary_selection);
    assert.ok(persisted.rows.find((row) => row.lottery === "super-sete")?.columns);
  },
);
