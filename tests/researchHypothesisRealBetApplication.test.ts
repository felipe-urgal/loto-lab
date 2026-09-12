import assert from "node:assert/strict";
import test from "node:test";
import {
  ResearchHypothesesUseCase,
  ResearchHypothesisNotFoundError,
  type ResearchHypothesis,
  type ResearchHypothesisBacktestEvidenceStore,
  type ResearchHypothesisStore,
} from "../src/application/researchHypotheses.js";

function hypothesis(): ResearchHypothesis {
  return {
    id: 7,
    title: "Aplicação experimental rastreável",
    description: "A decisão deve poder ser seguida até a aposta e o resultado real.",
    lottery: "mega-sena",
    status: "decided",
    decision: "applied-experimentally",
    decisionReason: "Aplicar em escala controlada.",
    decidedAt: "2026-09-12T12:00:00.000Z",
    createdAt: "2026-09-12T10:00:00.000Z",
    updatedAt: "2026-09-12T12:00:00.000Z",
  };
}

function store(current: ResearchHypothesis | undefined): ResearchHypothesisStore {
  return {
    async create() { return hypothesis(); },
    async findById() { return current; },
    async list() { return current ? [current] : []; },
    async decide() { return current; },
  };
}

function evidence(): ResearchHypothesisBacktestEvidenceStore {
  return {
    async linkBacktest(hypothesisId, backtestRunId) {
      return {
        hypothesisId,
        backtestRunId,
        lottery: "mega-sena",
        createdAt: "2026-09-12T11:00:00.000Z",
      };
    },
    async listBacktests() { return []; },
  };
}

test("research hypothesis exposes canonical real-bet applications without parallel evidence IDs", async () => {
  const expected = [{
    id: 41,
    batchId: 9,
    lottery: "mega-sena" as const,
    contestNumber: 3001,
    status: "checked",
    researchHypothesisId: 7,
    actualCost: 6,
    totalPrizeValue: 10,
    netResult: 4,
  }];
  const useCase = new ResearchHypothesesUseCase(
    store(hypothesis()),
    evidence(),
    { findById: async () => undefined },
    { listRealBets: async (hypothesisId) => hypothesisId === 7 ? expected : [] },
  );

  assert.deepEqual(await useCase.listRealBetApplications(7), expected);
});

test("research hypothesis application lookup distinguishes missing hypothesis from no applications", async () => {
  const missing = new ResearchHypothesesUseCase(
    store(undefined),
    evidence(),
    { findById: async () => undefined },
    { listRealBets: async () => [] },
  );
  await assert.rejects(() => missing.listRealBetApplications(404), ResearchHypothesisNotFoundError);

  const withoutApplications = new ResearchHypothesesUseCase(
    store(hypothesis()),
    evidence(),
    { findById: async () => undefined },
    { listRealBets: async () => [] },
  );
  assert.deepEqual(await withoutApplications.listRealBetApplications(7), []);
});
