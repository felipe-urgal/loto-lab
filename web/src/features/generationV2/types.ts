export type LotteryId = "mega-sena" | "lotofacil" | "dia-de-sorte";
export type NumberTier = "strong" | "balanced" | "cold";
export type SelectionMode = "fix" | "exclude" | "auto";
export type GenerationFilterKey = "odd" | "repeated" | "sum";
export type GenerationRangeEdge = "min" | "max";

export type GenerationRange = {
  min: number;
  max: number;
};

export type GenerationConstraints = {
  odd?: GenerationRange;
  repeated?: GenerationRange;
  sum?: GenerationRange;
};

export type GenerationMethodologyProfile = {
  defaultFixedCount: number;
  fixedCountOptions: number[];
  preferredOdd: GenerationRange;
  preferredRepeated: GenerationRange;
  acceptableRepeated: GenerationRange;
  notes: string[];
};

export type GenerationBaseline = {
  totalCombinations: number;
  expectedOdd: number;
  expectedRepeated: number | null;
  expectedSum: number;
  sumStdDev: number;
};

export type GenerationAlgorithmSpace = {
  fixedCount: number;
  variableCount: number;
  candidatePoolSize: number;
  rawCombinationCapacity: number;
  shortlistLimit: number;
};

export type GenerationPlan = {
  lottery: LotteryId;
  historyCount: number;
  historySignature: string;
  referenceContestNumber?: number;
  targetContestNumber?: number;
  universeSize: number;
  drawSize: number;
  fixedNumbers: number[];
  excludedNumbers: number[];
  constraints: GenerationConstraints;
  methodology: GenerationMethodologyProfile;
  numberTiers: Record<NumberTier, number[]>;
  lotteryBaseline: GenerationBaseline;
  baseline: GenerationBaseline;
  dataQuality: {
    previousContestAvailable: boolean;
    expectedPreviousContestNumber?: number;
    missingPreviousContestNumber?: number;
    historyGapCount: number;
  };
  constraintIssues: string[];
  algorithmSpaces: Record<string, GenerationAlgorithmSpace>;
  space: {
    afterManualSelection: number;
    eligibleCombinations: number;
    structuralCoverage: number;
    overallCoverage: number;
  };
};

export type GeneratedGame = {
  lottery: LotteryId;
  numbers: number[];
  fixedNumbers: number[];
  variableNumbers: number[];
  luckyMonth?: string;
  metadata: {
    odd: number;
    even: number;
    sum: number;
    repeatedFromLastContest: number[];
    lineDistribution?: number[];
    columnDistribution?: number[];
  };
};

export type GenerationBatchAudit = {
  sharedCore: number[];
  uniqueNumbers: number[];
  uniqueVariableNumbers: number[];
  averagePairwiseOverlap: number;
  minimumPairwiseOverlap: number;
  maximumPairwiseOverlap: number;
  plan: GenerationPlan;
};

export type GenerationPreviewResponse = {
  lottery: LotteryId;
  targetContestNumber?: number;
  games: GeneratedGame[];
  generatorOptions: {
    seed?: string;
    previewId?: string;
    [key: string]: unknown;
  };
  audit: GenerationBatchAudit;
  preview?: {
    id?: string;
    historySignature?: string;
    configSignature?: string;
    gameFingerprint?: string;
    expiresAt?: string;
  };
};

export type GenerationSaveResponse = {
  batchId: number;
  alreadySaved: boolean;
};

export type GenerationFilterState = GenerationRange & {
  enabled: boolean;
};

export type GenerationFilters = Record<GenerationFilterKey, GenerationFilterState>;

export type GenerationRequestPayload = {
  lottery: LotteryId;
  gameCount: number;
  fixedCount: number;
  targetContestNumber?: number;
  generationMode: "diversified";
  fixedNumbers: number[];
  excludedNumbers: number[];
  constraints?: GenerationConstraints;
  seed?: string;
};

export type GenerationPlanPayload = {
  lottery: LotteryId;
  targetContestNumber?: number;
  fixedNumbers: number[];
  excludedNumbers: number[];
  constraints?: GenerationConstraints;
};

export type GeneratorState = {
  lottery: LotteryId;
  gameCount: number;
  fixedCount: number;
  targetContestNumber?: number;
  fixed: Set<number>;
  excluded: Set<number>;
  selectionMode: SelectionMode;
  filters: GenerationFilters;
  plan: GenerationPlan;
  preview: GenerationPreviewResponse | null;
  controller: AbortController;
  cleanup: (() => void) | null;
};
