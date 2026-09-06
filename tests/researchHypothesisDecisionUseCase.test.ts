import assert from "node:assert/strict";
import test from "node:test";
import {
  ResearchHypothesisDecisionEvidenceRequiredError,
  ResearchHypothesisDecisionReasonInvalidError,
  ResearchHypothesisNotOpenError,
  ResearchHypothesesUseCase,
  type ResearchHypothesis,
  type ResearchHypothesisBacktestEvidenceStore,
  type ResearchHypothesisStore,
} from "../src/application/researchHypotheses.js";

function openHypothesis(): ResearchHypothesis {
  return {
    id: 7,
    title: "Hipótese",
    description: "Descrição auditável",
    lottery: "lotofacil",
    status: "open",
    decision: null,
    decisionReason: null,
    decidedAt: null,
    createdAt: "2026-09-06T12:00:00.000Z",
    updatedAt: "2026-09-06T12:00:00.000Z",
  };
}

function decidedHypothesis(
  decision: ResearchHypothesis["decision"] = "continue-testing",
  reason = "Continuar coleta em nova janela",
): ResearchHypothesis {
  return {
    ...openHypothesis(),
    status: "decided",
    decision,
    decisionReason: reason,
    decidedAt: "2026-09-06T13:00:00.000Z",
    updatedAt: "2026-09-06T13:00:00.000Z",
  };
}

function persistedEvidence(): ResearchHypothesisBacktestEvidenceStore {
  return {
    linkBacktest: async (hypothesisId, backtestRunId) => ({
      hypothesisId,
      backtestRunId,
      lottery: "lotofacil",
      createdAt: "2026-09-06T12:30:00.000Z",
    }),
    listBacktests: async (hypothesisId) => [{
      hypothesisId,
      backtestRunId: 11,
      lottery: "lotofacil",
      createdAt: "2026-09-06T12:30:00.000Z",
    }],
  };
}

test("research decision requires persisted evidence and stores a normalized human reason", async () => {
  const current = openHypothesis();
  const calls: Array<[number, string, string]> = [];
  const store: ResearchHypothesisStore = {
    create: async () => current,
    findById: async () => current,
    list: async () => [current],
    decide: async (id, decision, reason) => {
      calls.push([id, decision, reason]);
      return decidedHypothesis(decision, reason);
    },
  };
  const useCase = new ResearchHypothesesUseCase(
    store,
    persistedEvidence(),
    { findById: async () => undefined },
  );

  const result = await useCase.decide(7, {
    decision: "continue-testing",
    reason: "  Continuar coleta em nova janela  ",
  });

  assert.equal(result.status, "decided");
  assert.equal(result.decision, "continue-testing");
  assert.equal(result.decisionReason, "Continuar coleta em nova janela");
  assert.deepEqual(calls, [[7, "continue-testing", "Continuar coleta em nova janela"]]);
});

test("research decision rejects a hypothesis without persisted evidence", async () => {
  const current = openHypothesis();
  let decisionWrites = 0;
  const store: ResearchHypothesisStore = {
    create: async () => current,
    findById: async () => current,
    list: async () => [current],
    decide: async () => {
      decisionWrites += 1;
      return decidedHypothesis();
    },
  };
  const evidence: ResearchHypothesisBacktestEvidenceStore = {
    linkBacktest: persistedEvidence().linkBacktest,
    listBacktests: async () => [],
  };
  const useCase = new ResearchHypothesesUseCase(
    store,
    evidence,
    { findById: async () => undefined },
  );

  await assert.rejects(
    () => useCase.decide(7, { decision: "inconclusive", reason: "Sem resolução suficiente" }),
    ResearchHypothesisDecisionEvidenceRequiredError,
  );
  assert.equal(decisionWrites, 0);
});

test("research decision rejects blank reasons before persistence", async () => {
  const current = openHypothesis();
  let reads = 0;
  const store: ResearchHypothesisStore = {
    create: async () => current,
    findById: async () => {
      reads += 1;
      return current;
    },
    list: async () => [current],
    decide: async () => decidedHypothesis(),
  };
  const useCase = new ResearchHypothesesUseCase(
    store,
    persistedEvidence(),
    { findById: async () => undefined },
  );

  await assert.rejects(
    () => useCase.decide(7, { decision: "rejected", reason: "   " }),
    ResearchHypothesisDecisionReasonInvalidError,
  );
  assert.equal(reads, 0);
});

test("research decision does not re-decide a closed hypothesis", async () => {
  const current = decidedHypothesis();
  let evidenceReads = 0;
  let decisionWrites = 0;
  const store: ResearchHypothesisStore = {
    create: async () => current,
    findById: async () => current,
    list: async () => [current],
    decide: async () => {
      decisionWrites += 1;
      return current;
    },
  };
  const evidence: ResearchHypothesisBacktestEvidenceStore = {
    linkBacktest: persistedEvidence().linkBacktest,
    listBacktests: async () => {
      evidenceReads += 1;
      return [];
    },
  };
  const useCase = new ResearchHypothesesUseCase(
    store,
    evidence,
    { findById: async () => undefined },
  );

  await assert.rejects(
    () => useCase.decide(7, { decision: "rejected", reason: "Nova decisão" }),
    ResearchHypothesisNotOpenError,
  );
  assert.equal(evidenceReads, 0);
  assert.equal(decisionWrites, 0);
});

test("research decision surfaces a concurrent winner instead of silently overwriting it", async () => {
  const open = openHypothesis();
  const decided = decidedHypothesis("rejected", "Outra decisão venceu a corrida");
  let reads = 0;
  const store: ResearchHypothesisStore = {
    create: async () => open,
    findById: async () => {
      reads += 1;
      return reads === 1 ? open : decided;
    },
    list: async () => [open],
    decide: async () => undefined,
  };
  const useCase = new ResearchHypothesesUseCase(
    store,
    persistedEvidence(),
    { findById: async () => undefined },
  );

  await assert.rejects(
    () => useCase.decide(7, { decision: "inconclusive", reason: "Minha decisão" }),
    ResearchHypothesisNotOpenError,
  );
  assert.equal(reads, 2);
});
