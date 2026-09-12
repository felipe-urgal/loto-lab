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

export interface ResearchHypothesisRealBetApplication {
  id: number;
  batchId: number;
  lottery: LotteryId;
  contestNumber: number;
  status: string;
  researchHypothesisId: number | null;
  actualCost: number;
  totalPrizeValue?: number;
  netResult?: number;
}

export interface CreateResearchHypothesisCommand {
  title: string;
  description: string;
  lottery?: LotteryId | null;
}

export interface DecideResearchHypothesisCommand {
  decision: ResearchHypothesisDecision;
  reason: string;
}

export interface ResearchHypothesisListFilter {
  lottery?: LotteryId;
  limit?: number;
}

export interface ResearchHypothesisStore {
  create(input: CreateResearchHypothesisCommand): Promise<ResearchHypothesis>;
  findById(id: number): Promise<ResearchHypothesis | undefined>;
  list(filter?: ResearchHypothesisListFilter): Promise<ResearchHypothesis[]>;
  decide(
    id: number,
    decision: ResearchHypothesisDecision,
    reason: string,
  ): Promise<ResearchHypothesis | undefined>;
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

export interface ResearchHypothesisRealBetApplicationReader {
  listRealBets(hypothesisId: number): Promise<ResearchHypothesisRealBetApplication[]>;
}

export class ResearchHypothesisNotFoundError extends Error {
  readonly code = "RESEARCH_HYPOTHESIS_NOT_FOUND";

  constructor(readonly hypothesisId: number) {
    super(`Research hypothesis ${hypothesisId} was not found`);
  }
}

export class ResearchHypothesisNotOpenError extends Error {
  readonly code = "RESEARCH_HYPOTHESIS_NOT_OPEN";

  constructor(readonly hypothesisId: number) {
    super(`Research hypothesis ${hypothesisId} must be open for this operation`);
  }
}

export class ResearchHypothesisDecisionEvidenceRequiredError extends Error {
  readonly code = "RESEARCH_HYPOTHESIS_EVIDENCE_REQUIRED";

  constructor(readonly hypothesisId: number) {
    super(`Research hypothesis ${hypothesisId} requires persisted evidence before a decision`);
  }
}

export class ResearchHypothesisDecisionReasonInvalidError extends Error {
  readonly code = "RESEARCH_HYPOTHESIS_DECISION_REASON_INVALID";

  constructor() {
    super("Research hypothesis decision reason must contain 1 to 4000 characters");
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
    private readonly realBetApplications?: ResearchHypothesisRealBetApplicationReader,
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

  async decide(
    hypothesisId: number,
    input: DecideResearchHypothesisCommand,
  ): Promise<ResearchHypothesis> {
    const reason = input.reason.trim();
    if (reason.length === 0 || reason.length > 4000) {
      throw new ResearchHypothesisDecisionReasonInvalidError();
    }

    const hypothesis = await this.hypotheses.findById(hypothesisId);
    if (!hypothesis) throw new ResearchHypothesisNotFoundError(hypothesisId);
    if (hypothesis.status !== "open") throw new ResearchHypothesisNotOpenError(hypothesisId);

    const evidence = await this.evidence.listBacktests(hypothesisId);
    if (evidence.length === 0) {
      throw new ResearchHypothesisDecisionEvidenceRequiredError(hypothesisId);
    }

    const decided = await this.hypotheses.decide(hypothesisId, input.decision, reason);
    if (decided) return decided;

    const current = await this.hypotheses.findById(hypothesisId);
    if (!current) throw new ResearchHypothesisNotFoundError(hypothesisId);
    throw new ResearchHypothesisNotOpenError(hypothesisId);
  }

  async linkBacktestEvidence(
    hypothesisId: number,
    backtestRunId: number,
  ): Promise<ResearchHypothesisBacktestEvidence> {
    const hypothesis = await this.hypotheses.findById(hypothesisId);
    if (!hypothesis) throw new ResearchHypothesisNotFoundError(hypothesisId);
    if (hypothesis.status !== "open") throw new ResearchHypothesisNotOpenError(hypothesisId);

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

  async listRealBetApplications(
    hypothesisId: number,
  ): Promise<ResearchHypothesisRealBetApplication[]> {
    const hypothesis = await this.hypotheses.findById(hypothesisId);
    if (!hypothesis) throw new ResearchHypothesisNotFoundError(hypothesisId);
    return this.realBetApplications?.listRealBets(hypothesisId) ?? [];
  }
}
