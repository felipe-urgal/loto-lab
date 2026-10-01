export type SupportedLotteryId =
  | "mega-sena"
  | "lotofacil"
  | "dia-de-sorte"
  | "quina"
  | "lotomania"
  | "dupla-sena"
  | "mais-milionaria"
  | "timemania"
  | "super-sete";

export type LotteryProductId =
  | SupportedLotteryId
  | "loteca"
  | "lotogol"
  | "federal"
  | "instantanea";

export type LotteryFamily =
  | "number-draw"
  | "number-draw-secondary"
  | "dual-number-draw"
  | "column-draw"
  | "sports-prediction"
  | "ticket-draw"
  | "instant-product";

export interface LotteryCapabilities {
  history: boolean;
  agenda: boolean;
  simulation: boolean;
  analysis: boolean;
  checking: boolean;
  variableBetSize: boolean;
  secondaryFields: boolean;
  columns: boolean;
  sportsPrediction: boolean;
  ticket: boolean;
  instantProduct: boolean;
}

export interface LotteryRuleVersion {
  version: string;
  effectiveFrom: string;
}

export interface LotteryCatalogEntry {
  id: LotteryProductId;
  name: string;
  family: LotteryFamily;
  enabled: boolean;
  capabilities: Readonly<LotteryCapabilities>;
  rules: Readonly<LotteryRuleVersion>;
}

export type SecondarySelection =
  | { kind: "lucky-month"; values: string[] }
  | { kind: "clovers"; values: number[] }
  | { kind: "favorite-team"; values: string[] };

export type SportsOutcome = "home" | "draw" | "away";

export interface SportsMatchResult {
  sequence: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  outcome: SportsOutcome;
}

export type BetSpec =
  | { family: "number-draw"; numbers: number[] }
  | { family: "number-draw-secondary"; numbers: number[]; secondary: SecondarySelection }
  | { family: "dual-number-draw"; numbers: number[] }
  | { family: "column-draw"; columns: number[] }
  | {
      family: "sports-prediction";
      mode: "result";
      predictions: SportsOutcome[][];
    }
  | {
      family: "sports-prediction";
      mode: "score";
      predictions: Array<{ home: number; away: number }>;
    }
  | { family: "ticket-draw"; ticketNumber: string }
  | { family: "instant-product"; productCode: string };

export type DrawResult =
  | { family: "number-draw"; numbers: number[] }
  | { family: "number-draw-secondary"; numbers: number[]; secondary: SecondarySelection }
  | { family: "dual-number-draw"; draws: [number[], number[]] }
  | { family: "column-draw"; columns: number[] }
  | {
      family: "sports-prediction";
      mode: "result";
      outcomes: SportsOutcome[];
      matches?: SportsMatchResult[];
    }
  | {
      family: "sports-prediction";
      mode: "score";
      outcomes: Array<{ home: number; away: number }>;
    }
  | {
      family: "ticket-draw";
      prizes: Array<{ position: number; ticketNumber: string }>;
    };

const standardNumericCapabilities: LotteryCapabilities = {
  history: true,
  agenda: true,
  simulation: true,
  analysis: true,
  checking: true,
  variableBetSize: true,
  secondaryFields: false,
  columns: false,
  sportsPrediction: false,
  ticket: false,
  instantProduct: false,
};

function capabilities(
  overrides: Partial<LotteryCapabilities> = {},
): Readonly<LotteryCapabilities> {
  return Object.freeze({ ...standardNumericCapabilities, ...overrides });
}

export const LOTTERY_CATALOG = {
  "mega-sena": {
    id: "mega-sena",
    name: "Mega-Sena",
    family: "number-draw",
    enabled: true,
    capabilities: capabilities(),
    rules: { version: "2026-09", effectiveFrom: "2026-09-30" },
  },
  lotofacil: {
    id: "lotofacil",
    name: "Lotofácil",
    family: "number-draw",
    enabled: true,
    capabilities: capabilities(),
    rules: { version: "2026-09", effectiveFrom: "2026-09-30" },
  },
  "dia-de-sorte": {
    id: "dia-de-sorte",
    name: "Dia de Sorte",
    family: "number-draw-secondary",
    enabled: true,
    capabilities: capabilities({ secondaryFields: true }),
    rules: { version: "2026-09", effectiveFrom: "2026-09-30" },
  },
  quina: {
    id: "quina",
    name: "Quina",
    family: "number-draw",
    enabled: true,
    capabilities: capabilities(),
    rules: { version: "2026-09", effectiveFrom: "2026-09-30" },
  },
  lotomania: {
    id: "lotomania",
    name: "Lotomania",
    family: "number-draw",
    enabled: true,
    capabilities: capabilities(),
    rules: { version: "2026-09", effectiveFrom: "2026-09-30" },
  },
  "dupla-sena": {
    id: "dupla-sena",
    name: "Dupla Sena",
    family: "dual-number-draw",
    enabled: true,
    capabilities: capabilities(),
    rules: { version: "2026-09", effectiveFrom: "2026-09-30" },
  },
  "mais-milionaria": {
    id: "mais-milionaria",
    name: "+Milionária",
    family: "number-draw-secondary",
    enabled: true,
    capabilities: capabilities({ secondaryFields: true }),
    rules: { version: "2026-09", effectiveFrom: "2026-09-30" },
  },
  timemania: {
    id: "timemania",
    name: "Timemania",
    family: "number-draw-secondary",
    enabled: true,
    capabilities: capabilities({ secondaryFields: true }),
    rules: { version: "2026-09", effectiveFrom: "2026-09-30" },
  },
  "super-sete": {
    id: "super-sete",
    name: "Super Sete",
    family: "column-draw",
    enabled: true,
    capabilities: capabilities({ columns: true }),
    rules: { version: "2026-09", effectiveFrom: "2026-09-30" },
  },
  loteca: {
    id: "loteca",
    name: "Loteca",
    family: "sports-prediction",
    enabled: true,
    capabilities: capabilities({
      simulation: false,
      analysis: false,
      variableBetSize: false,
      sportsPrediction: true,
    }),
    rules: { version: "2026-09", effectiveFrom: "2026-09-30" },
  },
  lotogol: {
    id: "lotogol",
    name: "Lotogol",
    family: "sports-prediction",
    enabled: false,
    capabilities: capabilities({
      simulation: false,
      analysis: false,
      variableBetSize: false,
      sportsPrediction: true,
    }),
    rules: { version: "2026-09", effectiveFrom: "2026-09-30" },
  },
  federal: {
    id: "federal",
    name: "Loteria Federal",
    family: "ticket-draw",
    enabled: true,
    capabilities: capabilities({
      simulation: false,
      analysis: false,
      variableBetSize: false,
      ticket: true,
    }),
    rules: { version: "2026-09", effectiveFrom: "2026-09-30" },
  },
  instantanea: {
    id: "instantanea",
    name: "Instantânea",
    family: "instant-product",
    enabled: true,
    capabilities: capabilities({
      history: false,
      agenda: false,
      simulation: false,
      analysis: false,
      checking: false,
      variableBetSize: false,
      instantProduct: true,
    }),
    rules: { version: "2026-09", effectiveFrom: "2026-09-30" },
  },
} as const satisfies Record<LotteryProductId, LotteryCatalogEntry>;

export function getLotteryCatalogEntry(id: LotteryProductId): LotteryCatalogEntry {
  return LOTTERY_CATALOG[id];
}

export function supportsLotteryCapability(
  id: LotteryProductId,
  capability: keyof LotteryCapabilities,
): boolean {
  return LOTTERY_CATALOG[id].capabilities[capability];
}

export function isSupportedLotteryId(id: LotteryProductId): id is SupportedLotteryId {
  return id === "mega-sena"
    || id === "lotofacil"
    || id === "dia-de-sorte"
    || id === "quina"
    || id === "lotomania"
    || id === "dupla-sena"
    || id === "mais-milionaria"
    || id === "timemania"
    || id === "super-sete";
}
