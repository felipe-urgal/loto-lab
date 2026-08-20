import type { Pool } from "pg";
import type { LotteryId } from "../domain/types.js";
import { PostgresAiInsightRepository } from "../persistence/aiInsightRepository.js";
import { buildAiEvidenceContext } from "./context.js";
import type {
  AiInsightFocus,
  AiInsightRecord,
  AiInterpretationProvider,
} from "./types.js";

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

  async generate(lottery: LotteryId, focus: AiInsightFocus): Promise<AiInsightRecord> {
    const evidence = await buildAiEvidenceContext(this.pool, lottery);
    const result = await this.provider.interpret({ focus, evidence });
    return this.repository.save({
      lottery,
      focus,
      model: result.model,
      ...(result.providerResponseId ? { providerResponseId: result.providerResponseId } : {}),
      evidence,
      insight: result.insight,
      ...(result.usage ? { usage: result.usage } : {}),
    });
  }

  async history(lottery: LotteryId, limit = 20): Promise<AiInsightRecord[]> {
    return this.repository.listRecent(lottery, limit);
  }
}
