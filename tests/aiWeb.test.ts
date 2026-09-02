import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { createLotoLabServer } from "../src/api/server.js";
import type { AiInterpretationProvider } from "../src/ai/types.js";

const provider: AiInterpretationProvider = {
  name: "fake",
  isConfigured: () => true,
  model: () => "fake-model",
  async interpret() {
    return {
      model: "fake-model",
      insight: {
        headline: "Teste",
        summary: "Teste",
        observations: [],
        risks: [],
        nextTests: [],
      },
    };
  },
};

async function listen(server: ReturnType<typeof createLotoLabServer>): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${(address as AddressInfo).port}`;
}

test("AI workspace and provider status are served without exposing credentials", async (t) => {
  const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
  const server = createLotoLabServer({ pool, aiProvider: provider });
  const baseUrl = await listen(server);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const page = await fetch(`${baseUrl}/ai`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Algoritmo calcula\. IA interpreta\./);
  assert.match(html, /\/assets\/ai\.js/);
  assert.match(html, /\/assets\/ai-workspace\.css/);
  assert.doesNotMatch(html, /\/assets\/ai\.css/);

  const legacyStyle = await fetch(`${baseUrl}/assets/ai.css`);
  assert.equal(legacyStyle.status, 404);

  const script = await fetch(`${baseUrl}/assets/ai.js`);
  assert.equal(script.status, 200);
  const source = await script.text();
  assert.match(source, /\/ai\/insights/);
  assert.match(source, /let historyLoadToken = 0/);
  assert.match(source, /let insightRequestToken = 0/);
  assert.match(source, /const token = \+\+historyLoadToken/);
  assert.match(source, /token !== historyLoadToken \|\| lotterySelect\.value !== requestedLottery/);
  assert.match(source, /const token = \+\+insightRequestToken/);
  assert.match(source, /token !== insightRequestToken \|\| lotterySelect\.value !== requestedLottery/);
  assert.match(source, /insightRequestToken \+= 1/);
  assert.match(source, /<span>Teste histórico<\/span>/);
  assert.match(source, /o registro #\$\{record\.id\} foi reutilizado sem nova chamada ao provedor/);
  assert.match(source, /Registro #\$\{record\.id\} criado sem alterar qualquer cálculo ou jogo/);
  assert.doesNotMatch(source, /<span>Backtest<\/span>/);
  assert.doesNotMatch(source, /o snapshot #\$\{record\.id\}/);
  assert.doesNotMatch(source, /nova chamada ao provider/);
  // The UI may name OPENAI_API_KEY to explain local setup, but authentication
  // material and provider headers must remain exclusively on the backend.
  assert.doesNotMatch(source, /Authorization\s*:/i);
  assert.doesNotMatch(source, /Bearer\s+/i);
  assert.doesNotMatch(source, /sk-[A-Za-z0-9_-]{8,}/);

  const statusResponse = await fetch(`${baseUrl}/api/v1/ai/status`);
  assert.equal(statusResponse.status, 200);
  const status = (await statusResponse.json()) as { configured: boolean; model: string; provider: string };
  assert.deepEqual(status, {
    provider: "fake",
    configured: true,
    model: "fake-model",
    disclaimer: "A IA apenas interpreta métricas já calculadas. Ela não prevê sorteios, não aumenta a probabilidade matemática e não escolhe dezenas para apostar.",
  });
});

test("AI generation preserves not-configured precedence before request body parsing", async (t) => {
  let interpretations = 0;
  const unconfiguredProvider: AiInterpretationProvider = {
    name: "fake",
    isConfigured: () => false,
    model: () => "fake-model",
    async interpret() {
      interpretations += 1;
      throw new Error("interpret should not be called");
    },
  };
  const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
  const server = createLotoLabServer({ pool, aiProvider: unconfiguredProvider });
  const baseUrl = await listen(server);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const response = await fetch(`${baseUrl}/api/v1/ai/insights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{invalid-json",
  });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: {
      code: "AI_NOT_CONFIGURED",
      message: "Configure OPENAI_API_KEY to enable AI interpretation",
    },
  });
  assert.equal(interpretations, 0);
});
