import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import { releaseAdvisoryLockClient } from "../src/db/advisoryLock.js";
import { runOperationalSync } from "../src/operations/sync.js";

function fakeClient(options: {
  unlocked?: boolean;
  queryError?: Error;
}) {
  let releasedWith: Error | boolean | undefined;
  let releaseCalls = 0;
  const client = {
    async query() {
      if (options.queryError) throw options.queryError;
      return { rows: [{ unlocked: options.unlocked ?? true }] };
    },
    release(error?: Error | boolean) {
      releaseCalls += 1;
      releasedWith = error;
    },
  } as unknown as PoolClient;

  return {
    client,
    releasedWith: () => releasedWith,
    releaseCalls: () => releaseCalls,
  };
}

test("advisory lock client returns to the pool only after a confirmed unlock", async () => {
  const fake = fakeClient({ unlocked: true });
  await releaseAdvisoryLockClient(fake.client, "SELECT TRUE AS unlocked");
  assert.equal(fake.releaseCalls(), 1);
  assert.equal(fake.releasedWith(), undefined);
});

test("advisory lock client is discarded when unlock fails or cannot be confirmed", async () => {
  for (const fake of [
    fakeClient({ queryError: new Error("connection lost during unlock") }),
    fakeClient({ unlocked: false }),
  ]) {
    await assert.rejects(
      () => releaseAdvisoryLockClient(fake.client, "SELECT FALSE AS unlocked"),
    );
    assert.equal(fake.releaseCalls(), 1);
    assert.ok(fake.releasedWith() instanceof Error);
  }
});

test("operational sync discards the client when advisory lock acquisition fails", async () => {
  const queryError = new Error("connection lost during lock acquisition");
  const fake = fakeClient({ queryError });
  const pool = {
    async connect() {
      return fake.client;
    },
  } as unknown as Pool;

  await assert.rejects(
    () => runOperationalSync(pool),
    /connection lost during lock acquisition/,
  );
  assert.equal(fake.releaseCalls(), 1);
  assert.equal(fake.releasedWith(), queryError);
});

test("analysis jobs recover before the HTTP server starts accepting requests", async () => {
  const source = await readFile("src/cli/apiStart.ts", "utf8");
  const recoverIndex = source.indexOf("const recoveredJobs = await analysisJobs.start();");
  const listenIndex = source.indexOf("await listenServer(server, port, host);");

  assert.ok(recoverIndex >= 0, "analysis job recovery must be present in runtime startup");
  assert.ok(listenIndex >= 0, "HTTP listen must be present in runtime startup");
  assert.ok(recoverIndex < listenIndex, "analysis jobs must recover before HTTP starts accepting requests");
});
