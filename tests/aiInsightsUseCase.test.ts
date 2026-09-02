import assert from "node:assert/strict";
import test from "node:test";
import { AiInsightsUseCase } from "../src/application/aiInsights.js";
import { AiInterpretationError, type AiInterpretationProvider } from "../src/ai/types.js";

function provider(configured: boolean): AiInterpretationProvider {
  return {
    name: "test-provider",
    isConfigured: () => configured,
    model: () => "test-model",
    interpret: async () => {
      throw new Error("interpret should not be called");
    },
  };
}

test("AI insights status is exposed without touching persistence", () => {
  const useCase = new AiInsightsUseCase(
    { load: async () => { throw new Error("evidence should not be loaded"); } },
    {
      save: async () => { throw new Error("save should not be called"); },
      findByEvidenceHash: async () => undefined,
      listRecent: async () => [],
    },
    provider(true),
  );

  assert.deepEqual(useCase.status(), {
    provider: "test-provider",
    configured: true,
    model: "test-model",
  });
});

test("AI insights rejects generation before reading evidence when provider is not configured", async () => {
  let evidenceLoads = 0;
  const useCase = new AiInsightsUseCase(
    {
      load: async () => {
        evidenceLoads += 1;
        throw new Error("evidence should not be loaded");
      },
    },
    {
      save: async () => { throw new Error("save should not be called"); },
      findByEvidenceHash: async () => undefined,
      listRecent: async () => [],
    },
    provider(false),
  );

  await assert.rejects(
    () => useCase.generate("mega-sena", "overview"),
    (error: unknown) => {
      assert.ok(error instanceof AiInterpretationError);
      assert.equal(error.code, "AI_NOT_CONFIGURED");
      assert.equal(error.message, "Configure OPENAI_API_KEY to enable AI interpretation");
      return true;
    },
  );
  assert.equal(evidenceLoads, 0);
});

test("AI insights history delegates only the requested lottery and limit", async () => {
  const calls: Array<{ lottery: string; limit?: number }> = [];
  const useCase = new AiInsightsUseCase(
    { load: async () => { throw new Error("evidence should not be loaded"); } },
    {
      save: async () => { throw new Error("save should not be called"); },
      findByEvidenceHash: async () => undefined,
      listRecent: async (lottery, limit) => {
        calls.push({ lottery, limit });
        return [];
      },
    },
    provider(true),
  );

  assert.deepEqual(await useCase.history("mega-sena", 7), []);
  assert.deepEqual(calls, [{ lottery: "mega-sena", limit: 7 }]);
});
