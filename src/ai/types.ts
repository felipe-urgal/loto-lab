import type { LotteryId } from "../domain/types.js";

export type AiInsightFocus = "overview" | "analysis" | "strategy" | "real-performance";

export interface AiNumberEvidence {
  number: number;
  score: number;
  tier: "strong" | "balanced" | "cold";
  year: number;
  month: number;
  recent10: number;
  recent20: number;
  historical: number;
}

export interface AiBacktestEvidence {
  id: number;
  createdAt: string;
  options: Record<string, unknown>;
  summary: Record<string, unknown>;
}

export interface AiStrategyVariantEvidence {
  key: string;
  label: string;
  fixedCount: number;
  averageHitsPerGame: number;
  averageFixedHitsPerContest: number;
  maxHits: number;
  prizeRate: number;
  roi: number;
  financialCoverage: number;
  netResult: number;
}

export interface AiRealBetEvidence {
  contestNumber: number;
  status: string;
  actualCost: number;
  totalPrizeValue?: number;
  netResult?: number;
}

export interface AiEvidenceContext {
  lottery: LotteryId;
  generatedAt: string;
  latestContest?: {
    number: number;
    date: string;
  };
  analysis: {
    weights: Record<string, number>;
    tierCounts: {
      strong: number;
      balanced: number;
      cold: number;
    };
    strongest: AiNumberEvidence[];
    coldest: AiNumberEvidence[];
  };
  latestBacktest?: AiBacktestEvidence;
  strategyLab?: {
    startContest?: number;
    endContest?: number;
    gameCount: number;
    rankingBasis: "roi" | "prizeRate";
    winner?: string;
    variants: AiStrategyVariantEvidence[];
  };
  realPerformance: {
    totalBets: number;
    checkedBets: number;
    financiallyCheckedBets: number;
    pendingBets: number;
    actualCost: number;
    checkedCost: number;
    totalPrizeValue: number;
    netResult: number;
    roi?: number;
  };
  recentRealBets: AiRealBetEvidence[];
}

export interface AiInsightContent {
  headline: string;
  summary: string;
  observations: string[];
  risks: string[];
  nextTests: string[];
}

export interface AiProviderResult {
  model: string;
  providerResponseId?: string;
  insight: AiInsightContent;
  usage?: Record<string, unknown>;
}

export interface AiInterpretationRequest {
  focus: AiInsightFocus;
  evidence: AiEvidenceContext;
}

export interface AiInterpretationProvider {
  readonly name: string;
  isConfigured(): boolean;
  model(): string;
  interpret(request: AiInterpretationRequest): Promise<AiProviderResult>;
}

export interface AiInsightRecord {
  id: number;
  lottery: LotteryId;
  focus: AiInsightFocus;
  model: string;
  providerResponseId?: string;
  evidenceHash?: string;
  evidence: AiEvidenceContext;
  insight: AiInsightContent;
  usage?: Record<string, unknown>;
  createdAt: string;
  reused?: boolean;
}

export const AI_DISCLAIMER =
  "A IA apenas interpreta métricas já calculadas. Ela não prevê sorteios, não aumenta a probabilidade matemática e não escolhe dezenas para apostar.";
