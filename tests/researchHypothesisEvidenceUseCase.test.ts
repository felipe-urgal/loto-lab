import assert from "node:assert/strict";
import test from "node:test";
import {
  ResearchBacktestEvidenceNotFoundError,
  ResearchEvidenceLotteryMismatchError,
  ResearchHypothesisNotFoundError,
  ResearchHypothesisNotOpenError,
  ResearchHypothesesUseCase,
  type ResearchHypothesis,
  type ResearchHypothesisBacktestEvidence,
  type ResearchHypothesisBacktestEvidenceStore,
  type ResearchHypothesisStore,
} from "../src/application/researchHypotheses.js";

function hypothesis(
  lottery: ResearchHypothesis["lottery"],
  status: ResearchHypothesis["status"] = "open",
): ResearchHypothesis {
  return {
    id: 7,
    title: "Hipótese",
    description: "Descrição auditável",
    lottery,
    status,
    decision: status === "decided" ? "inconclusive" : null,
    decisionReason: status === "decided" ? "Evidência insuficiente" : null,
    decidedAt: status === "decided" ? "2026-09-06T12:30:00.000Z" : null,
    createdAt: "2026-09-06T12:00:00.000Z",
    updatedAt: "2026-09-06T12:00:00.000Z",
  };
}

function stores(current: ResearchHypothesis | undefined) {
  const linked: Array<[number, number]> = [];
  const hypotheses: ResearchHypothesisStore = {
    create: async () => current ?? hypothesis(null),
    findById: async () => current,
    list: async () => current ? [current] : [],
    decide: async () => current,
  };
  const evidence: ResearchHypothesisBacktestEvidenceStore = {
    linkBacktest: async (hypothesisId, backtestRunId) => {
      linked.push([hypothesisId, backtestRunId]);
      return {
        hypothesisId,
        backtestRunId,
        lottery: "lotofacil",
        createdAt: "2026-09-06T12:00:00.000Z",
      };
    },
    listBacktests: async () => [] as ResearchHypothesisBacktestEvidence[],
  };
  return { hypotheses, evidence, linked };
}

test("research evidence links a compatible persisted backtest", async () => {
  const setup = stores(hypothesis("lotofacil"));
  const useCase = new ResearchHypothesesUseCase(
    setup.hypotheses,
    setup.evidence,
    { findById: async () => ({ id: 11, lottery: "lotofacil" }) },
  );

  const result = await useCase.linkBacktestEvidence(7, 11);
  assert.equal(result.backtestRunId, 11);
  assert.deepEqual(setup.linked, [[7, 11]]);
});

test("research evidence rejects a decided hypothesis before loading or persisting evidence", async () => {
  const setup = stores(hypothesis("lotofacil", "decided"));
  let backtestRead = false;
  const useCase = new ResearchHypothesesUseCase(
    setup.hypotheses,
    setup.evidence,
    {
      findById: async () => {
        backtestRead = true;
        return { id: 11, lottery: "lotofacil" };
      },
    },
  );

  await assert.rejects(
    () => useCase.linkBacktestEvidence(7, 11),
    ResearchHypothesisNotOpenError,
  );
  assert.equal(backtestRead, false);
  assert.deepEqual(setup.linked, []);
});

test("research evidence rejects a backtest from another lottery before persistence", async () => {
  const setup = stores(hypothesis("lotofacil"));
  const useCase = new ResearchHypothesesUseCase(
    setup.hypotheses,
    setup.evidence,
    { findById: async () => ({ id: 11, lottery: "mega-sena" }) },
  );

  await assert.rejects(
    () => useCase.linkBacktestEvidence(7, 11),
    ResearchEvidenceLotteryMismatchError,
  );
  assert.deepEqual(setup.linked, []);
});

test("research evidence keeps a lottery-agnostic hypothesis compatible with persisted backtests", async () => {
  const setup = stores(hypothesis(null));
  const useCase = new ResearchHypothesesUseCase(
    setup.hypotheses,
    setup.evidence,
    { findById: async () => ({ id: 11, lottery: "mega-sena" }) },
  );

  await useCase.linkBacktestEvidence(7, 11);
  assert.deepEqual(setup.linked, [[7, 11]]);
});

test("research evidence distinguishes missing hypothesis from missing backtest", async () => {
  const missingHypothesis = stores(undefined);
  const withoutHypothesis = new ResearchHypothesesUseCase(
    missingHypothesis.hypotheses,
    missingHypothesis.evidence,
    { findById: async () => ({ id: 11, lottery: "mega-sena" }) },
  );
  await assert.rejects(
    () => withoutHypothesis.linkBacktestEvidence(7, 11),
    ResearchHypothesisNotFoundError,
  );

  const existing = stores(hypothesis("mega-sena"));
  const withoutBacktest = new ResearchHypothesesUseCase(
    existing.hypotheses,
    existing.evidence,
    { findById: async () => undefined },
  );
  await assert.rejects(
    () => withoutBacktest.linkBacktestEvidence(7, 11),
    ResearchBacktestEvidenceNotFoundError,
  );
});
