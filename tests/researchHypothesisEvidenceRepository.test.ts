import assert from "node:assert/strict";
import test from "node:test";
import { PostgresBacktestRepository } from "../src/persistence/backtestRepository.js";
import { PostgresResearchHypothesisRepository } from "../src/persistence/researchHypothesisRepository.js";
import { createIsolatedPostgresDatabase } from "./helpers/postgres.js";

test("research hypothesis persists one idempotent FK-backed backtest evidence relation", async (t) => {
  const database = await createIsolatedPostgresDatabase({ label: "research_backtest_evidence" });
  t.after(async () => database.close());

  const hypotheses = new PostgresResearchHypothesisRepository(database.pool);
  const backtests = new PostgresBacktestRepository(database.pool);

  const hypothesis = await hypotheses.create({
    title: "Backtest como evidência persistida",
    description: "Associar um artefato canônico sem copiar seu payload para a hipótese.",
    lottery: "lotofacil",
  });
  const backtest = await backtests.save({
    lottery: "lotofacil",
    options: { source: "research-evidence-test" },
    summary: { testedContests: 0, totalGames: 0 },
    rounds: [],
  });

  const first = await hypotheses.linkBacktest(hypothesis.id, backtest.id);
  const second = await hypotheses.linkBacktest(hypothesis.id, backtest.id);
  assert.deepEqual(second, first);
  assert.equal(first.hypothesisId, hypothesis.id);
  assert.equal(first.backtestRunId, backtest.id);
  assert.equal(first.lottery, "lotofacil");
  assert.deepEqual(await hypotheses.listBacktests(hypothesis.id), [first]);

  const rows = await database.pool.query<{
    hypothesis_id: string;
    backtest_run_id: string;
  }>(
    "SELECT hypothesis_id, backtest_run_id FROM research_hypothesis_backtest_evidence",
  );
  assert.deepEqual(rows.rows, [{
    hypothesis_id: String(hypothesis.id),
    backtest_run_id: String(backtest.id),
  }]);

  await database.pool.query(
    `
      UPDATE research_hypotheses
      SET status = 'decided',
          decision = 'inconclusive',
          decision_reason = 'Amostra ainda insuficiente',
          decided_at = NOW()
      WHERE id = $1
    `,
    [hypothesis.id],
  );
  const laterBacktest = await backtests.save({
    lottery: "lotofacil",
    options: { source: "research-evidence-after-decision" },
    summary: { testedContests: 0, totalGames: 0 },
    rounds: [],
  });

  await assert.rejects(
    database.pool.query(
      `
        INSERT INTO research_hypothesis_backtest_evidence (hypothesis_id, backtest_run_id)
        VALUES ($1, $2)
      `,
      [hypothesis.id, laterBacktest.id],
    ),
    /must be open to attach evidence/,
  );
});
