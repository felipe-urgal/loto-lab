import type { Pool } from "pg";
import type { LotteryId } from "../domain/types.js";
import type {
  AiEvidenceContext,
  AiInsightContent,
  AiInsightFocus,
  AiInsightRecord,
} from "../ai/types.js";

interface AiInsightRow {
  id: string;
  lottery: LotteryId;
  focus: AiInsightFocus;
  model: string;
  provider_response_id: string | null;
  evidence_hash: string | null;
  evidence: AiEvidenceContext;
  insight: AiInsightContent;
  usage: Record<string, unknown> | null;
  created_at: Date;
}

export interface SaveAiInsightInput {
  lottery: LotteryId;
  focus: AiInsightFocus;
  model: string;
  providerResponseId?: string;
  evidenceHash?: string;
  evidence: AiEvidenceContext;
  insight: AiInsightContent;
  usage?: Record<string, unknown>;
}

function mapRow(row: AiInsightRow): AiInsightRecord {
  return {
    id: Number(row.id),
    lottery: row.lottery,
    focus: row.focus,
    model: row.model,
    ...(row.provider_response_id ? { providerResponseId: row.provider_response_id } : {}),
    ...(row.evidence_hash ? { evidenceHash: row.evidence_hash } : {}),
    evidence: row.evidence,
    insight: row.insight,
    ...(row.usage ? { usage: row.usage } : {}),
    createdAt: row.created_at.toISOString(),
  };
}

export class PostgresAiInsightRepository {
  constructor(private readonly pool: Pool) {}

  async save(input: SaveAiInsightInput): Promise<AiInsightRecord> {
    const result = await this.pool.query<AiInsightRow>(
      `
        INSERT INTO ai_insights (
          lottery, focus, model, provider_response_id, evidence_hash, evidence, insight, usage
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)
        RETURNING id, lottery, focus, model, provider_response_id, evidence_hash, evidence, insight, usage, created_at
      `,
      [
        input.lottery,
        input.focus,
        input.model,
        input.providerResponseId ?? null,
        input.evidenceHash ?? null,
        JSON.stringify(input.evidence),
        JSON.stringify(input.insight),
        input.usage ? JSON.stringify(input.usage) : null,
      ],
    );
    return mapRow(result.rows[0]!);
  }

  async findByEvidenceHash(
    lottery: LotteryId,
    focus: AiInsightFocus,
    model: string,
    evidenceHash: string,
  ): Promise<AiInsightRecord | undefined> {
    const result = await this.pool.query<AiInsightRow>(
      `
        SELECT id, lottery, focus, model, provider_response_id, evidence_hash, evidence, insight, usage, created_at
        FROM ai_insights
        WHERE lottery = $1 AND focus = $2 AND model = $3 AND evidence_hash = $4
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [lottery, focus, model, evidenceHash],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async listRecent(lottery: LotteryId, limit = 20): Promise<AiInsightRecord[]> {
    const result = await this.pool.query<AiInsightRow>(
      `
        SELECT id, lottery, focus, model, provider_response_id, evidence_hash, evidence, insight, usage, created_at
        FROM ai_insights
        WHERE lottery = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2
      `,
      [lottery, limit],
    );
    return result.rows.map(mapRow);
  }
}
