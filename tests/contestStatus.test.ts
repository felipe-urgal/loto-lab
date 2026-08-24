import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { PostgresContestRepository } from "../src/persistence/contestRepository.js";

test("contest repository reports internal gaps and complete financial coverage without loading draw payloads", async () => {
  const calls: string[] = [];
  const pool = {
    async query(sql: string) {
      calls.push(sql);
      if (sql.includes("SELECT contest_number")) {
        return { rows: [{ contest_number: 100 }, { contest_number: 102 }] };
      }
      return {
        rows: [{
          contest_count: "3",
          first_contest: 100,
          last_contest: 103,
          financial_contest_count: "2",
          last_updated_at: new Date("2026-08-20T15:00:00.000Z"),
        }],
      };
    },
  } as unknown as Pool;

  const repository = new PostgresContestRepository(pool);
  assert.deepEqual(await repository.listContestNumbers("mega-sena", 100, 103), [100, 102]);

  const status = await repository.getDataStatus("mega-sena");
  assert.equal(status.contestCount, 3);
  assert.equal(status.firstContest, 100);
  assert.equal(status.lastContest, 103);
  assert.equal(status.missingContestCount, 1);
  assert.equal(status.internalMissingContestCount, 1);
  assert.equal(status.historyBeforeFirstContestCount, 99);
  assert.equal(status.financialContestCount, 2);
  assert.equal(status.financialCoverage, 2 / 3);
  assert.equal(status.lastUpdatedAt, "2026-08-20T15:00:00.000Z");
  assert.ok(calls.some((sql) => sql.includes("EXISTS")));
  assert.ok(calls.some((sql) => sql.includes("15[[:space:]]*acertos")));
});
