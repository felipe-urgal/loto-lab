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
          lottery, focus, model, provider_response_id, evidence, insight, usage
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
        RETURNING id, lottery, focus, model, provider_response_id, evidence, insight, usage, created_at
      `,
      [
        input.lottery,
        input.focus,
        input.model,
        input.providerResponseId ?? null,
        JSON.stringify(input.evidence),
        JSON.stringify(input.insight),
        input.usage ? JSON.stringify(input.usage) : null,
      ],
    );
    return mapRow(result.rows[0]!);
  }

  async listRecent(lottery: LotteryId, limit = 20): Promise<AiInsightRecord[]> {
    const result = await this.pool.query<AiInsightRow>(
      `
        SELECT id, lottery, focus, model, provider_response_id, evidence, insight, usage, created_at
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
