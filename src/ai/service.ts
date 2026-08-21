import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { LotteryId } from "../domain/types.js";
import { PostgresAiInsightRepository } from "../persistence/aiInsightRepository.js";
import { buildAiEvidenceContext } from "./context.js";
import type {
  AiEvidenceContext,
  AiInsightFocus,
  AiInsightRecord,
  AiInterpretationProvider,
} from "./types.js";

const inFlight = new Map<string, Promise<AiInsightRecord>>();

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

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "23505");
}

export class AiInsightService {
  private readonly repository: PostgresAiInsightRepository;

  constructor(
    private readonly pool: Pool,
    private readonly provider: AiInterpretationProvider,
  ) {
    this.repository = new PostgresAiInsightRepository(pool);
  }

  status() {
    return {
      provider: this.provider.name,
      configured: this.provider.isConfigured(),
      model: this.provider.model(),
    };
  }

  async generate(lottery: LotteryId, focus: AiInsightFocus, force = false): Promise<AiInsightRecord> {
    const evidence = await buildAiEvidenceContext(this.pool, lottery);
    const hash = evidenceHash(evidence);
    const model = this.provider.model();

    if (!force) {
      const cached = await this.repository.findByEvidenceHash(lottery, focus, model, hash);
      if (cached) return { ...cached, reused: true };
    }

    const key = `${lottery}:${focus}:${model}:${hash}`;
    const existingRun = !force ? inFlight.get(key) : undefined;
    if (existingRun) return { ...(await existingRun), reused: true };

    const run = (async () => {
      const result = await this.provider.interpret({ focus, evidence });
      try {
        return await this.repository.save({
          lottery,
          focus,
          model: result.model,
          ...(result.providerResponseId ? { providerResponseId: result.providerResponseId } : {}),
          evidenceHash: hash,
          evidence,
          insight: result.insight,
          ...(result.usage ? { usage: result.usage } : {}),
        });
      } catch (error) {
        if (!force && isUniqueViolation(error)) {
          const concurrent = await this.repository.findByEvidenceHash(lottery, focus, result.model, hash);
          if (concurrent) return concurrent;
        }
        throw error;
      }
    })();

    if (!force) inFlight.set(key, run);
    try {
      return await run;
    } finally {
      if (!force && inFlight.get(key) === run) inFlight.delete(key);
    }
  }

  async history(lottery: LotteryId, limit = 20): Promise<AiInsightRecord[]> {
    return this.repository.listRecent(lottery, limit);
  }
}
