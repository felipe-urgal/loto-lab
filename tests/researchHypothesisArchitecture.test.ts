import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(path: string): Promise<string> {
  return readFile(path, "utf8");
}

test("research hypotheses attach backtest evidence through explicit persisted ownership", async () => {
  const [rootMigration, evidenceMigration, application, repository, api, routes, server] = await Promise.all([
    source("db/migrations/013_research_hypotheses.sql"),
    source("db/migrations/014_research_backtest_evidence.sql"),
    source("src/application/researchHypotheses.ts"),
    source("src/persistence/researchHypothesisRepository.ts"),
    source("src/api/researchHypotheses.ts"),
    source("src/api/routes.ts"),
    source("src/api/server.ts"),
  ]);

  assert.match(rootMigration, /CREATE TABLE research_hypotheses/);
  assert.match(rootMigration, /status IN \('open', 'decided'\)/);
  assert.match(rootMigration, /research_hypotheses_decision_state_check/);
  assert.doesNotMatch(rootMigration, /experiment_id|evidence_id|backtest_run_id|analysis_job_id|preview_id|batch_id|ai_insight_id/i);

  assert.match(evidenceMigration, /CREATE TABLE research_hypothesis_backtest_evidence/);
  assert.match(evidenceMigration, /REFERENCES research_hypotheses\(id\) ON DELETE CASCADE/);
  assert.match(evidenceMigration, /REFERENCES backtest_runs\(id\) ON DELETE RESTRICT/);
  assert.match(evidenceMigration, /PRIMARY KEY \(hypothesis_id, backtest_run_id\)/);
  assert.doesNotMatch(evidenceMigration, /payload|jsonb|evidence_type/i);

  assert.match(application, /ResearchHypothesisBacktestEvidenceStore/);
  assert.match(application, /ResearchBacktestEvidenceReader/);
  assert.match(application, /ResearchEvidenceLotteryMismatchError/);
  assert.match(application, /hypothesis\.lottery !== null && hypothesis\.lottery !== backtest\.lottery/);
  assert.match(repository, /INSERT INTO research_hypothesis_backtest_evidence/);
  assert.match(repository, /JOIN backtest_runs/);

  assert.match(api, /const evidenceMatch =/);
  assert.match(api, /hypotheses\.linkBacktestEvidence/);
  assert.match(api, /hypotheses\.listBacktestEvidence/);
  assert.doesNotMatch(api, /decide\(|\/decision/);

  assert.match(routes, /serveResearchHypotheses/);
  assert.match(server, /new ResearchHypothesesUseCase\(\s*researchHypotheses,\s*researchHypotheses,\s*backtests,/s);
});
