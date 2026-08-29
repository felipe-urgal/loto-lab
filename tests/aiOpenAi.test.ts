import test from "node:test";
import assert from "node:assert/strict";
import { OpenAiInterpretationProvider, OpenAiProviderError } from "../src/ai/openai.js";
import type { AiEvidenceContext } from "../src/ai/types.js";

const evidence: AiEvidenceContext = {
  lottery: "mega-sena",
  generatedAt: "2026-08-20T18:00:00.000Z",
  analysis: {
    weights: { year: 0.3, recent20: 0.25, month: 0.2, historical: 0.15, recent10: 0.1 },
    tierCounts: { strong: 20, balanced: 20, cold: 20 },
    strongest: [],
    coldest: [],
  },
  realPerformance: {
    totalBets: 0,
    checkedBets: 0,
    financiallyCheckedBets: 0,
    pendingBets: 0,
    actualCost: 0,
    checkedCost: 0,
    totalPrizeValue: 0,
    netResult: 0,
  },
  recentRealBets: [],
};

function assertProviderError(
  error: unknown,
  expectedCode: string,
  expectedStatus?: number,
): boolean {
  assert.ok(error instanceof OpenAiProviderError);
  assert.equal(error.code, expectedCode);
  assert.equal(error.status, expectedStatus);
  return true;
}

test("OpenAI provider sends bounded structured evidence and parses the insight contract", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(url);
    requestInit = init;
    return new Response(JSON.stringify({
      id: "resp_test",
      model: "gpt-5.6-luna",
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify({
            headline: "Sem evidência de vantagem",
            summary: "Os dados atuais ainda são insuficientes para uma conclusão operacional.",
            observations: ["Não há apostas reais conferidas."],
            risks: ["Amostra real inexistente."],
            nextTests: ["Executar comparação em janela maior."],
          }),
        }],
      }],
      usage: { input_tokens: 100, output_tokens: 50 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  const provider = new OpenAiInterpretationProvider({
    apiKey: "sk-test-secret",
    model: "gpt-5.6-luna",
    fetchImpl,
  });
  const result = await provider.interpret({ focus: "overview", evidence });

  assert.equal(requestUrl, "https://api.openai.com/v1/responses");
  assert.equal(new Headers(requestInit?.headers).get("Authorization"), "Bearer sk-test-secret");
  const body = JSON.parse(String(requestInit?.body)) as {
    model: string;
    instructions: string;
    input: string;
    store: boolean;
    text: {
      format: {
        type: string;
        name: string;
        strict: boolean;
        schema: { required: string[]; additionalProperties: boolean };
      };
    };
  };
  assert.equal(body.model, "gpt-5.6-luna");
  assert.match(body.instructions, /não gere, escolha ou recomende dezenas/i);
  assert.equal(JSON.parse(body.input).evidence.lottery, "mega-sena");
  assert.equal(body.store, false);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.name, "loto_lab_insight");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
  assert.deepEqual(
    body.text.format.schema.required,
    ["headline", "summary", "observations", "risks", "nextTests"],
  );
  assert.equal(result.providerResponseId, "resp_test");
  assert.equal(result.insight.headline, "Sem evidência de vantagem");
  assert.deepEqual(result.insight.nextTests, ["Executar comparação em janela maior."]);
});

test("OpenAI provider rejects unstructured output defensively", async () => {
  const fetchImpl = (async () => new Response(JSON.stringify({
    id: "resp_invalid",
    model: "gpt-5.6-luna",
    output_text: "Jogue os números X e Y",
  }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;

  const provider = new OpenAiInterpretationProvider({ apiKey: "sk-test", fetchImpl });
  await assert.rejects(
    () => provider.interpret({ focus: "analysis", evidence }),
    (error) => assertProviderError(error, "AI_INVALID_RESPONSE"),
  );
});

test("OpenAI provider rejects requests when credentials are not configured", async () => {
  const provider = new OpenAiInterpretationProvider({ apiKey: "   " });
  await assert.rejects(
    () => provider.interpret({ focus: "overview", evidence }),
    (error) => assertProviderError(error, "AI_NOT_CONFIGURED"),
  );
});

test("OpenAI provider maps transport failures to provider unavailable", async () => {
  const fetchImpl = (async () => {
    throw new Error("socket closed");
  }) as typeof fetch;
  const provider = new OpenAiInterpretationProvider({ apiKey: "sk-test", fetchImpl });

  await assert.rejects(
    () => provider.interpret({ focus: "overview", evidence }),
    (error) => assertProviderError(error, "AI_PROVIDER_UNAVAILABLE", 502),
  );
});

test("OpenAI provider maps abort and timeout failures to gateway timeout", async () => {
  const fetchImpl = (async () => {
    const error = new Error("timed out");
    error.name = "TimeoutError";
    throw error;
  }) as typeof fetch;
  const provider = new OpenAiInterpretationProvider({ apiKey: "sk-test", fetchImpl });

  await assert.rejects(
    () => provider.interpret({ focus: "overview", evidence }),
    (error) => assertProviderError(error, "AI_PROVIDER_TIMEOUT", 504),
  );
});

test("OpenAI provider preserves upstream error code and HTTP status", async () => {
  const fetchImpl = (async () => new Response(JSON.stringify({
    error: { code: "rate_limit_exceeded", message: "Too many requests" },
  }), { status: 429, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  const provider = new OpenAiInterpretationProvider({ apiKey: "sk-test", fetchImpl });

  await assert.rejects(
    () => provider.interpret({ focus: "overview", evidence }),
    (error) => assertProviderError(error, "rate_limit_exceeded", 429),
  );
});
