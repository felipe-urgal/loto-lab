import { createHash } from "node:crypto";
import type { LotteryId } from "../domain/types.js";
import {
  AiInterpretationError,
  type AiEvidenceContext,
  type AiInsightContent,
  type AiInsightFocus,
  type AiInsightRecord,
  type AiInterpretationProvider,
} from "../ai/types.js";

export interface AiEvidenceReader {
  load(lottery: LotteryId): Promise<AiEvidenceContext>;
}

export interface AiInsightSaveInput {
  lottery: LotteryId;
  focus: AiInsightFocus;
  model: string;
  providerResponseId?: string;
  evidenceHash?: string;
  evidence: AiEvidenceContext;
  insight: AiInsightContent;
  usage?: Record<string, unknown>;
}

export interface AiInsightStore {
  save(input: AiInsightSaveInput): Promise<AiInsightRecord>;
  findByEvidenceHash(
    lottery: LotteryId,
    focus: AiInsightFocus,
    model: string,
    evidenceHash: string,
  ): Promise<AiInsightRecord | undefined>;
  listRecent(lottery: LotteryId, limit?: number): Promise<AiInsightRecord[]>;
}

export class AiInsightStoreConflictError extends Error {}

interface AiInsightInFlight {
  promise: Promise<AiInsightRecord>;
}

const inFlight = new Map<string, AiInsightInFlight>();

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function evidenceHash(evidence: AiEvidenceContext): string {
  const { generatedAt: _generatedAt, ...semanticEvidence } = evidence;
  return createHash("sha256")
    .update(JSON.stringify(stableValue(semanticEvidence)))
    .digest("hex");
}

export class AiInsightsUseCase {
  constructor(
    private readonly evidence: AiEvidenceReader,
    private readonly repository: AiInsightStore,
    private readonly provider: AiInterpretationProvider,
  ) {}

  status() {
    return {
      provider: this.provider.name,
      configured: this.provider.isConfigured(),
      model: this.provider.model(),
    };
  }

  ensureConfigured(): void {
    if (!this.provider.isConfigured()) {
      throw new AiInterpretationError(
        "AI_NOT_CONFIGURED",
        "Configure OPENAI_API_KEY to enable AI interpretation",
      );
    }
  }

  async generate(lottery: LotteryId, focus: AiInsightFocus, force = false): Promise<AiInsightRecord> {
    this.ensureConfigured();

    const evidence = await this.evidence.load(lottery);
    const hash = evidenceHash(evidence);
    const model = this.provider.model();

    if (!force) {
      const cached = await this.repository.findByEvidenceHash(lottery, focus, model, hash);
      if (cached) return { ...cached, reused: true };
    }

    const key = `${lottery}:${focus}:${model}:${hash}`;
    const existingRun = !force ? inFlight.get(key) : undefined;
    if (existingRun) return { ...(await existingRun.promise), reused: true };

    const run = (async () => {
      const result = await this.provider.interpret({ focus, evidence });
      try {
        return await this.repository.save({
          lottery,
          focus,
          model: result.model,
          ...(result.providerResponseId ? { providerResponseId: result.providerResponseId } : {}),
          ...(!force ? { evidenceHash: hash } : {}),
          evidence,
          insight: result.insight,
          ...(result.usage ? { usage: result.usage } : {}),
        });
      } catch (error) {
        if (!force && error instanceof AiInsightStoreConflictError) {
          const concurrent = await this.repository.findByEvidenceHash(lottery, focus, result.model, hash);
          if (concurrent) return concurrent;
        }
        throw error;
      }
    })();

    const entry: AiInsightInFlight = { promise: run };
    if (!force) inFlight.set(key, entry);
    try {
      return await run;
    } finally {
      if (!force && inFlight.get(key) === entry) inFlight.delete(key);
    }
  }

  async history(lottery: LotteryId, limit = 20): Promise<AiInsightRecord[]> {
    return this.repository.listRecent(lottery, limit);
  }
}
