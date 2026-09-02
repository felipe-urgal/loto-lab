export type AnalysisTab = "ranking" | "structure" | "dynamics" | "combinations" | "validation";
export type AnalysisTier = "strong" | "balanced" | "cold";
export type EvidenceLevel = "moderate" | "weak" | "none";

export type AnalysisDataQuality = {
  continuous: boolean;
  missingContestCount: number;
  leftCensored: boolean;
  firstStoredContest: number;
  latestContinuousContests?: number;
};

export type AnalysisNumberItem = {
  number: number;
  rank: number;
  tier: AnalysisTier;
  score: number;
  movements: {
    ten: number | null;
  };
  trend: string;
  weightRobustness: {
    tierStability: number;
    strongShare: number;
    scenarioCount: number;
    rankRange: [number, number];
  };
  delay: {
    current: number | null;
    percentile: number | null;
  };
  streak: number | null;
  contribution: Record<string, number>;
  frequency: Record<string, { count: number; rate: number }>;
  previousRanks: {
    one?: number | null;
    five?: number | null;
    ten?: number | null;
    twenty?: number | null;
  };
  components: {
    year: number;
    month: number;
    recent10: number;
    recent20: number;
    historical: number;
  };
};

export type RankingMover = {
  number: number;
  rank: number;
  movement: number;
};

export type AnalysisRanking = {
  tiers: Record<AnalysisTier, number[]>;
  dynamics: {
    items: AnalysisNumberItem[];
    movers: {
      rising: RankingMover[];
      falling: RankingMover[];
    };
  };
};

export type DistributionPoint = {
  value: number;
  probability: number;
};

export type StructureMetric = {
  current?: number | null;
  observed?: { mean: number } | null;
  percentile?: number;
  expectedMean?: number;
  deviationFromExpected?: number;
  theoreticalDistribution?: DistributionPoint[];
};

export type Coverage = {
  coverage: number;
  passing: number;
  total: number;
};

export type HistoricalExpectedCoverage = Coverage & {
  minCoverage: number;
  maxCoverage: number;
};

export type MethodologyRule = {
  min: number;
  max: number;
  preferredMin?: number;
  preferredMax?: number;
};

export type StructureMethodologyFilter = {
  nextContestUniverse?: Coverage | null;
  exactUniverse?: Coverage | null;
  historical: Coverage;
  historicalExpected?: HistoricalExpectedCoverage | null;
  rules: {
    repeated: MethodologyRule;
    odd: MethodologyRule;
  };
  note: string;
};

export type AnalysisStructure = {
  metrics: {
    repeated: StructureMetric;
    odd: StructureMetric;
    sum: StructureMetric;
    low: StructureMetric;
    longestRun: StructureMetric;
    frame?: StructureMetric | null;
  };
  methodologyFilter: StructureMethodologyFilter;
  grid?: {
    currentLines: number[];
    currentColumns: number[];
    historicalLineMean: number[];
    historicalColumnMean: number[];
  } | null;
};

export type AnalysisCycles = {
  available: boolean;
  currentLength: number;
  seen: number;
  missing: number[];
  historicalLength?: { mean: number } | null;
  completedCount: number;
};

export type HeatmapRow = {
  contest: number;
  numbers: number[];
};

export type AnalysisDynamics = {
  cycles: AnalysisCycles;
  heatmap?: HeatmapRow[];
};

export type AssociationItem = {
  numbers: number[];
  observed: number;
  expected: number;
  lift: number;
  zScore: number;
  adjustedPValue: number;
  evidence: EvidenceLevel;
};

export type AnalysisCombinations = {
  methodology: {
    availableContests?: number;
    minimumContests?: number;
    tripleComparisons: number;
    note: string;
  };
  highlights: {
    positivePairs: AssociationItem[];
    negativePairs: AssociationItem[];
    positiveTriples: AssociationItem[];
  };
  pairs: AssociationItem[];
};

export type SimilarContest = {
  contest: number;
  date?: string | null;
  overlap: number;
  sharedNumbers: number[];
};

export type ValidationTier = {
  tier: AnalysisTier;
  evidence: EvidenceLevel;
  difference: number;
  observedRate: number;
  expectedRate: number;
  observedHits: number;
  expectedHits: number;
  adjustedPValue: number;
};

export type ValidationPeriod = {
  window: number;
  rounds: number;
  evidenceEligible?: boolean;
  tiers: ValidationTier[];
};

export type AnalysisValidation = {
  periods: ValidationPeriod[];
  methodology: {
    note: string;
    minimumEvidenceRounds?: number;
    warmupContests: number;
    leakageProtection: boolean;
    correction: string;
  };
  sourceContests: number;
};

export type AdvancedAnalysis = {
  latestContest?: {
    number: number;
    date?: string | null;
  } | null;
  dataQuality?: AnalysisDataQuality | null;
  model: {
    disclaimer: string;
  };
  ranking: AnalysisRanking;
  structure: AnalysisStructure;
  dynamics: AnalysisDynamics;
  combinations: AnalysisCombinations;
  similarity: {
    closest?: SimilarContest[];
  };
  validation: AnalysisValidation;
};

export type AnalysisPayload = {
  advanced: AdvancedAnalysis;
};
