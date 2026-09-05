import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(path: string): Promise<string> {
  return readFile(path, "utf8");
}

test("research hypothesis root composes through repository/use case/API without parallel evidence identities", async () => {
  const [migration, application, repository, api, routes, server] = await Promise.all([
    source("db/migrations/013_research_hypotheses.sql"),
    source("src/application/researchHypotheses.ts"),
    source("src/persistence/researchHypothesisRepository.ts"),
    source("src/api/researchHypotheses.ts"),
    source("src/api/routes.ts"),
    source("src/api/server.ts"),
  ]);

  assert.match(migration, /CREATE TABLE research_hypotheses/);
  assert.match(migration, /status IN \('open', 'decided'\)/);
  assert.match(migration, /research_hypotheses_decision_state_check/);
  assert.doesNotMatch(migration, /experiment_id|evidence_id|backtest_run_id|analysis_job_id|preview_id|batch_id|ai_insight_id/i);

  assert.match(application, /ResearchHypothesisStore/);
  assert.match(repository, /INSERT INTO research_hypotheses/);
  assert.match(api, /\/api\/v1\/research\/hypotheses/);
  assert.match(api, /hypotheses\.create/);
  assert.match(api, /hypotheses\.list/);
  assert.match(api, /hypotheses\.get/);
  assert.doesNotMatch(api, /decision\s*=|decide\(|evidence|backtest|analysis-job|preview|batch/i);

  assert.match(routes, /serveResearchHypotheses/);
  assert.match(server, /new ResearchHypothesesUseCase\(researchHypotheses\)/);
});
