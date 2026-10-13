import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import type { AddressInfo } from "node:net";
import { createLotoLabServer } from "../src/api/server.js";
import { createIsolatedPostgresDatabase } from "./helpers/postgres.js";

const unsupported = ["quina", "lotomania", "dupla-sena", "mais-milionaria", "timemania", "super-sete"] as const;

test("HTTP rejects all unsupported legacy backtests before persistence", { skip: !process.env.DATABASE_URL }, async t => {
  const database = await createIsolatedPostgresDatabase({ label: "unsupported-backtest", max: 4 });
  const server = createLotoLabServer({ pool: database.pool });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await database.close();
  });
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}/api/v1/backtests/run`;
  const before = await database.pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM backtest_runs");
  for (const lottery of unsupported) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lottery, gameCount: 1, warmupContests: 20, persist: true }),
    });
    assert.equal(response.status, 422, lottery);
    const payload = await response.json() as { error: { code: string } };
    assert.equal(payload.error.code, "UNSUPPORTED_BACKTEST_LOTTERY", lottery);
  }
  const after = await database.pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM backtest_runs");
  assert.equal(after.rows[0]?.count, before.rows[0]?.count);
});

test("worker never falls back to Dia de Sorte for an unsupported lottery", async () => {
  for (const lottery of unsupported) {
    const worker = new Worker(new URL("../src/api/analysisWorker.js", import.meta.url), {
      workerData: { kind: "backtest", contests: [], input: { lottery, gameCount: 1, warmupContests: 1, persist: false } },
    });
    const message = await new Promise<{ ok: boolean; error?: { code?: string } }>((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.once("exit", code => { if (code !== 0) reject(new Error(`worker exit ${code}`)); });
    });
    assert.equal(message.ok, false, lottery);
    assert.equal(message.error?.code, "UNSUPPORTED_BACKTEST_LOTTERY", lottery);
  }
});
