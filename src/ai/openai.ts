import type {
  AiInsightContent,
  AiInterpretationProvider,
  AiInterpretationRequest,
  AiProviderResult,
} from "./types.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_TIMEOUT_MS = 30_000;

const SYSTEM_INSTRUCTIONS = `Você é a camada interpretativa do Loto Lab.
Regra central: o algoritmo calcula; a IA interpreta.

Você recebe somente evidências já calculadas pelo sistema. Siga estas regras sem exceção:
- não recalcule métricas nem invente valores ausentes;
- não gere, escolha ou recomende dezenas, jogos ou Mês da Sorte;
- não diga que uma dezena está "mais provável", "atrasada" ou "deve sair";
- não afirme vantagem matemática onde os dados não demonstram isso;
- diferencie backtest, Laboratório e apostas reais;
- destaque amostra pequena, cobertura financeira insuficiente, empate e sobreajuste quando aplicável;
- sugestões devem ser apenas próximos testes, validações de dados ou comparações metodológicas;
- responda em português do Brasil;
- seja conciso e baseado somente no JSON fornecido.

Retorne SOMENTE JSON válido, sem markdown, exatamente com esta estrutura:
{
  "headline": "string",
  "summary": "string",
  "observations": ["string"],
  "risks": ["string"],
  "nextTests": ["string"]
}`;

interface OpenAiResponse {
  id?: string;
  model?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: Record<string, unknown>;
  error?: { message?: string; code?: string };
}

export class OpenAiProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

function extractText(response: OpenAiResponse): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const pieces: string[] = [];
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string" && content.text.trim()) pieces.push(content.text.trim());
    }
  }
  return pieces.join("\n").trim();
}

function cleanJsonText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function stringField(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new OpenAiProviderError("AI_INVALID_RESPONSE", `OpenAI response is missing ${field}`);
  }
  return value.trim();
}

function stringArray(value: unknown, field: string, maxItems = 6): string[] {
  if (!Array.isArray(value)) {
    throw new OpenAiProviderError("AI_INVALID_RESPONSE", `OpenAI response is missing ${field}`);
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, maxItems)
    .map((item) => item.trim());
}

function parseInsight(text: string): AiInsightContent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanJsonText(text));
  } catch {
    throw new OpenAiProviderError("AI_INVALID_RESPONSE", "OpenAI returned invalid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new OpenAiProviderError("AI_INVALID_RESPONSE", "OpenAI returned an invalid insight object");
  }
  const record = parsed as Record<string, unknown>;
  return {
    headline: stringField(record.headline, "headline"),
    summary: stringField(record.summary, "summary"),
    observations: stringArray(record.observations, "observations"),
    risks: stringArray(record.risks, "risks"),
    nextTests: stringArray(record.nextTests, "nextTests"),
  };
}

export interface OpenAiInterpretationProviderOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class OpenAiInterpretationProvider implements AiInterpretationProvider {
  readonly name = "openai";
  private readonly apiKey?: string;
  private readonly modelName: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: OpenAiInterpretationProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.modelName = options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs < 1000 || this.timeoutMs > 120_000) {
      throw new Error("OpenAI timeout must be between 1000 and 120000 ms");
    }
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey?.trim());
  }

  model(): string {
    return this.modelName;
  }

  async interpret(request: AiInterpretationRequest): Promise<AiProviderResult> {
    if (!this.isConfigured()) {
      throw new OpenAiProviderError("AI_NOT_CONFIGURED", "OPENAI_API_KEY is not configured");
    }

    let response: Response;
    try {
      response = await this.fetchImpl(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelName,
          instructions: SYSTEM_INSTRUCTIONS,
          input: JSON.stringify({
            focus: request.focus,
            evidence: request.evidence,
          }),
          max_output_tokens: 1400,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new OpenAiProviderError("AI_PROVIDER_TIMEOUT", "OpenAI request timed out", 504);
      }
      throw new OpenAiProviderError(
        "AI_PROVIDER_UNAVAILABLE",
        error instanceof Error ? error.message : "OpenAI request failed before receiving a response",
        502,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as OpenAiResponse;
    if (!response.ok) {
      throw new OpenAiProviderError(
        payload.error?.code ?? "AI_PROVIDER_ERROR",
        payload.error?.message ?? `OpenAI request failed with HTTP ${response.status}`,
        response.status,
      );
    }

    const text = extractText(payload);
    if (!text) throw new OpenAiProviderError("AI_EMPTY_RESPONSE", "OpenAI returned no text output");

    return {
      model: payload.model ?? this.modelName,
      ...(payload.id ? { providerResponseId: payload.id } : {}),
      insight: parseInsight(text),
      ...(payload.usage ? { usage: payload.usage } : {}),
    };
  }
}
