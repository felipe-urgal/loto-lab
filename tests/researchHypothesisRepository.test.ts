import assert from "node:assert/strict";
import test from "node:test";
import { PostgresResearchHypothesisRepository } from "../src/persistence/researchHypothesisRepository.js";
import { createIsolatedPostgresDatabase } from "./helpers/postgres.js";

test("research hypotheses persist an auditable root without synthetic evidence IDs", async (t) => {
  const database = await createIsolatedPostgresDatabase({ label: "research_hypothesis" });
  t.after(async () => database.close());
  const repository = new PostgresResearchHypothesisRepository(database.pool);

  const general = await repository.create({
    title: "Repetição estrutural merece novo teste",
    description: "Avaliar se o filtro estrutural mantém comportamento estável em períodos distintos.",
  });
  const lotterySpecific = await repository.create({
    title: "Robustez da estratégia na Lotofácil",
    description: "Comparar a mesma hipótese em janelas contínuas sem vazamento futuro.",
    lottery: "lotofacil",
  });

  assert.equal(general.status, "open");
  assert.equal(general.lottery, null);
  assert.equal(general.decision, null);
  assert.equal(general.decisionReason, null);
  assert.equal(general.decidedAt, null);
  assert.equal(lotterySpecific.lottery, "lotofacil");

  assert.deepEqual((await repository.list({ lottery: "lotofacil" })).map((item) => item.id), [lotterySpecific.id]);
  assert.deepEqual((await repository.list({ limit: 1 })).map((item) => item.id), [lotterySpecific.id]);
  assert.equal((await repository.findById(general.id))?.title, general.title);
  assert.equal(await repository.findById(999_999), undefined);

  await assert.rejects(
    database.pool.query(
      "UPDATE research_hypotheses SET status = 'decided' WHERE id = $1",
      [general.id],
    ),
    /research_hypotheses_decision_state_check/,
  );
});
