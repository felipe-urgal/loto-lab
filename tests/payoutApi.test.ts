import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createLotoLabServer } from "../src/api/server.js";
import { createIsolatedPostgresDatabase } from "./helpers/postgres.js";

type PreviewResponse = {
  games: Array<{ numbers: number[]; secondary?: { kind: string; values: Array<string | number> } }>;
  generatorOptions: { seed: string; payout?: { strategy: string; modelAge: { stale: boolean } } };
};

async function post(baseUrl: string, path: string, body: Record<string, unknown>) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test(
  "payout generators flow through HTTP preview and PostgreSQL persistence for every supported lottery",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const database = await createIsolatedPostgresDatabase({ label: "payout-api", max: 4 });
    const server = createLotoLabServer({ pool: database.pool });
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
      { lottery: "mega-sena", size: 6, strategy: "mega-sena-payout-v1", extra: {}, fixedNumbers: [10], fixedCount: 2 },
      { lottery: "lotofacil", size: 15, strategy: "lotofacil-payout-v1", extra: {}, fixedNumbers: [13, 5], fixedCount: 8 },
      { lottery: "quina", size: 5, strategy: "quina-payout-v1", extra: {}, fixedNumbers: [], fixedCount: 0 },
      { lottery: "dia-de-sorte", size: 7, strategy: "dia-de-sorte-payout-v1", extra: {}, fixedNumbers: [15], fixedCount: 3 },
      { lottery: "dupla-sena", size: 6, strategy: "dupla-sena-payout-v1", extra: {}, fixedNumbers: [], fixedCount: 0 },
      { lottery: "mais-milionaria", size: 6, strategy: "mais-milionaria-payout-v1", extra: { cloverCount: 3 }, fixedNumbers: [], fixedCount: 0 },
      { lottery: "timemania", size: 10, strategy: "timemania-payout-v1", extra: { favoriteTeam: "FLAMENGO/RJ" }, fixedNumbers: [], fixedCount: 0 },
    ] as const;

    for (const item of cases) {
      const input = {
        lottery: item.lottery,
        gameCount: 3,
        fixedCount: item.fixedCount,
        fixedNumbers: [...item.fixedNumbers],
        excludedNumbers: [item.lottery === "lotofacil" ? 25 : 2],
        purpose: "payout",
        ...item.extra,
      };
      const previewResponse = await post(baseUrl, "/api/v1/generation/preview", input);
      assert.equal(previewResponse.status, 200, `${item.lottery} payout preview failed: ${await previewResponse.clone().text()}`);
      const preview = (await previewResponse.json()) as PreviewResponse;
      assert.equal(preview.games.length, 3);
      assert.ok(preview.games.every((game) => game.numbers.length === item.size));
      assert.ok(preview.games.every((game) => item.fixedNumbers.every((number) => game.numbers.includes(number))));
      assert.equal(preview.generatorOptions.payout?.strategy, item.strategy);
      assert.equal(typeof preview.generatorOptions.payout?.modelAge.stale, "boolean");

      const saveResponse = await post(baseUrl, "/api/v1/generation/save", { ...input, seed: preview.generatorOptions.seed });
      assert.equal(saveResponse.status, 201, `${item.lottery} payout save failed: ${await saveResponse.clone().text()}`);
      const saved = (await saveResponse.json()) as { batchId: number; games: PreviewResponse["games"] };
      assert.ok(saved.batchId > 0);
      assert.deepEqual(saved.games, preview.games);
    }

    const stored = await database.pool.query<{ lottery: string; payout: { strategy: string } | null }>(
      "SELECT lottery, generator_options->'payout' AS payout FROM generated_game_batches ORDER BY id",
    );
    assert.equal(stored.rows.length, cases.length);
    assert.ok(stored.rows.every((row) => typeof row.payout?.strategy === "string"));
  },
);

test(
  "payout rejects lotteries without a validated model and shared cores outside the persistable set",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const database = await createIsolatedPostgresDatabase({ label: "payout-api-reject", max: 2 });
    const server = createLotoLabServer({ pool: database.pool });
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
    const response = await post(`http://127.0.0.1:${(address as AddressInfo).port}`, "/api/v1/generation/preview", {
      lottery: "lotomania",
      gameCount: 1,
      fixedCount: 0,
      purpose: "payout",
    });
    assert.equal(response.status, 400);
    const base = `http://127.0.0.1:${(address as AddressInfo).port}`;
    for (const [lottery, fixedCount] of [["mega-sena", 1], ["lotofacil", 0], ["quina", 1]] as const) {
      const invalid = await post(base, "/api/v1/generation/preview", { lottery, gameCount: 1, fixedCount, purpose: "payout" });
      assert.equal(invalid.status, 400, `${lottery} fixedCount ${fixedCount} must be rejected before it cannot be saved`);
    }
  },
);
