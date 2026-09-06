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

export interface ResearchHypothesisBacktestEvidence {
  hypothesisId: number;
  backtestRunId: number;
  lottery: LotteryId;
  createdAt: string;
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

export interface ResearchHypothesisBacktestEvidenceStore {
  linkBacktest(
    hypothesisId: number,
    backtestRunId: number,
  ): Promise<ResearchHypothesisBacktestEvidence>;
  listBacktests(hypothesisId: number): Promise<ResearchHypothesisBacktestEvidence[]>;
}

export interface ResearchBacktestEvidenceReader {
  findById(id: number): Promise<{ id: number; lottery: LotteryId } | undefined>;
}

export class ResearchHypothesisNotFoundError extends Error {
  readonly code = "RESEARCH_HYPOTHESIS_NOT_FOUND";

  constructor(readonly hypothesisId: number) {
    super(`Research hypothesis ${hypothesisId} was not found`);
  }
}

export class ResearchBacktestEvidenceNotFoundError extends Error {
  readonly code = "BACKTEST_RUN_NOT_FOUND";

  constructor(readonly backtestRunId: number) {
    super(`Backtest run ${backtestRunId} was not found`);
  }
}

export class ResearchEvidenceLotteryMismatchError extends Error {
  readonly code = "RESEARCH_EVIDENCE_LOTTERY_MISMATCH";

  constructor(
    readonly hypothesisLottery: LotteryId,
    readonly backtestLottery: LotteryId,
  ) {
    super(`Research hypothesis belongs to ${hypothesisLottery}, but backtest belongs to ${backtestLottery}`);
  }
}

export class ResearchHypothesesUseCase {
  constructor(
    private readonly hypotheses: ResearchHypothesisStore,
    private readonly evidence: ResearchHypothesisBacktestEvidenceStore,
    private readonly backtests: ResearchBacktestEvidenceReader,
  ) {}

  create(input: CreateResearchHypothesisCommand): Promise<ResearchHypothesis> {
    return this.hypotheses.create(input);
  }

  get(id: number): Promise<ResearchHypothesis | undefined> {
    return this.hypotheses.findById(id);
  }

  list(filter: ResearchHypothesisListFilter = {}): Promise<ResearchHypothesis[]> {
    return this.hypotheses.list(filter);
  }

  async linkBacktestEvidence(
    hypothesisId: number,
    backtestRunId: number,
  ): Promise<ResearchHypothesisBacktestEvidence> {
    const hypothesis = await this.hypotheses.findById(hypothesisId);
    if (!hypothesis) throw new ResearchHypothesisNotFoundError(hypothesisId);

    const backtest = await this.backtests.findById(backtestRunId);
    if (!backtest) throw new ResearchBacktestEvidenceNotFoundError(backtestRunId);

    if (hypothesis.lottery !== null && hypothesis.lottery !== backtest.lottery) {
      throw new ResearchEvidenceLotteryMismatchError(hypothesis.lottery, backtest.lottery);
    }

    return this.evidence.linkBacktest(hypothesisId, backtestRunId);
  }

  async listBacktestEvidence(hypothesisId: number): Promise<ResearchHypothesisBacktestEvidence[]> {
    const hypothesis = await this.hypotheses.findById(hypothesisId);
    if (!hypothesis) throw new ResearchHypothesisNotFoundError(hypothesisId);
    return this.evidence.listBacktests(hypothesisId);
  }
}
