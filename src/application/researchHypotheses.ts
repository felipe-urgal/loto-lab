import type { LotteryId } from "../domain/types.js";

export type ResearchHypothesisStatus = "open" | "decided";
export type ResearchHypothesisDecision =
  | "inconclusive"
  | "rejected"
  | "continue-testing"
  | "applied-experimentally";

export interface ResearchHypothesis {
  id: number;
  title: string;
  description: string;
  lottery: LotteryId | null;
  status: ResearchHypothesisStatus;
  decision: ResearchHypothesisDecision | null;
  decisionReason: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateResearchHypothesisCommand {
  title: string;
  description: string;
  lottery?: LotteryId | null;
}

export interface ResearchHypothesisListFilter {
  lottery?: LotteryId;
  limit?: number;
}

export interface ResearchHypothesisStore {
  create(input: CreateResearchHypothesisCommand): Promise<ResearchHypothesis>;
  findById(id: number): Promise<ResearchHypothesis | undefined>;
  list(filter?: ResearchHypothesisListFilter): Promise<ResearchHypothesis[]>;
}

export class ResearchHypothesesUseCase {
  constructor(private readonly hypotheses: ResearchHypothesisStore) {}

  create(input: CreateResearchHypothesisCommand): Promise<ResearchHypothesis> {
    return this.hypotheses.create(input);
  }

  get(id: number): Promise<ResearchHypothesis | undefined> {
    return this.hypotheses.findById(id);
  }

  list(filter: ResearchHypothesisListFilter = {}): Promise<ResearchHypothesis[]> {
    return this.hypotheses.list(filter);
  }
}
