import type { Pool } from "pg";
import type {
  CreateResearchHypothesisCommand,
  ResearchHypothesis,
  ResearchHypothesisDecision,
  ResearchHypothesisListFilter,
  ResearchHypothesisStatus,
} from "../application/researchHypotheses.js";
import type { LotteryId } from "../domain/types.js";

interface ResearchHypothesisRow {
  id: string;
  title: string;
  description: string;
  lottery: LotteryId | null;
  status: ResearchHypothesisStatus;
  decision: ResearchHypothesisDecision | null;
  decision_reason: string | null;
  decided_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapResearchHypothesis(row: ResearchHypothesisRow): ResearchHypothesis {
  return {
    id: Number(row.id),
    title: row.title,
    description: row.description,
    lottery: row.lottery,
    status: row.status,
    decision: row.decision,
    decisionReason: row.decision_reason,
    decidedAt: row.decided_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresResearchHypothesisRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateResearchHypothesisCommand): Promise<ResearchHypothesis> {
    const result = await this.pool.query<ResearchHypothesisRow>(
      `
        INSERT INTO research_hypotheses (title, description, lottery)
        VALUES ($1, $2, $3)
        RETURNING *
      `,
      [input.title, input.description, input.lottery ?? null],
    );
    return mapResearchHypothesis(result.rows[0]!);
  }

  async findById(id: number): Promise<ResearchHypothesis | undefined> {
    const result = await this.pool.query<ResearchHypothesisRow>(
      "SELECT * FROM research_hypotheses WHERE id = $1",
      [id],
    );
    return result.rows[0] ? mapResearchHypothesis(result.rows[0]) : undefined;
  }

  async list(filter: ResearchHypothesisListFilter = {}): Promise<ResearchHypothesis[]> {
    const limit = filter.limit ?? 50;
    const result = filter.lottery
      ? await this.pool.query<ResearchHypothesisRow>(
          `
            SELECT *
            FROM research_hypotheses
            WHERE lottery = $1
            ORDER BY created_at DESC, id DESC
            LIMIT $2
          `,
          [filter.lottery, limit],
        )
      : await this.pool.query<ResearchHypothesisRow>(
          `
            SELECT *
            FROM research_hypotheses
            ORDER BY created_at DESC, id DESC
            LIMIT $1
          `,
          [limit],
        );
    return result.rows.map(mapResearchHypothesis);
  }
}
