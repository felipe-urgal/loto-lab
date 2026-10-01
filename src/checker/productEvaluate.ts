import type { BetSpec, DrawResult, SportsOutcome } from "../domain/lotteryCatalog.js";

export interface LotecaCheckResult {
  product: "loteca";
  hits: number;
  matchedMatches: number[];
  prizeTier?: "13-acertos" | "14-acertos";
}

export interface FederalCheckResult {
  product: "federal";
  ticketNumber: string;
  mainPrizePosition?: number;
  milharPrizePositions: number[];
  centenaPrizePositions: number[];
  dezenaPrizePositions: number[];
}

export type LotteryProductCheckResult = LotecaCheckResult | FederalCheckResult;

function canonicalTicket(value: string): string {
  const digits = value.trim();
  if (!/^\d{1,6}$/.test(digits)) {
    throw new Error("Federal ticket number must contain 1 to 6 digits");
  }
  return digits.replace(/^0+(?=\d)/, "");
}

function validatePrediction(selection: SportsOutcome[], index: number): void {
  if (selection.length < 1 || selection.length > 3) {
    throw new Error(`Loteca match ${index + 1} must contain 1 to 3 predictions`);
  }
  if (new Set(selection).size !== selection.length) {
    throw new Error(`Loteca match ${index + 1} contains duplicate predictions`);
  }
}

export function evaluateLotecaBet(bet: BetSpec, result: DrawResult): LotecaCheckResult {
  if (bet.family !== "sports-prediction" || bet.mode !== "result") {
    throw new Error("Loteca checking requires a result-prediction bet");
  }
  if (result.family !== "sports-prediction" || result.mode !== "result") {
    throw new Error("Loteca checking requires a result-prediction draw");
  }
  if (bet.predictions.length !== 14 || result.outcomes.length !== 14) {
    throw new Error("Loteca checking requires exactly 14 matches");
  }

  const matchedMatches: number[] = [];
  bet.predictions.forEach((selection, index) => {
    validatePrediction(selection, index);
    if (selection.includes(result.outcomes[index]!)) matchedMatches.push(index + 1);
  });

  const hits = matchedMatches.length;
  return {
    product: "loteca",
    hits,
    matchedMatches,
    ...(hits === 14 ? { prizeTier: "14-acertos" as const }
      : hits === 13 ? { prizeTier: "13-acertos" as const }
        : {}),
  };
}

export function evaluateFederalTicket(bet: BetSpec, result: DrawResult): FederalCheckResult {
  if (bet.family !== "ticket-draw") {
    throw new Error("Federal checking requires a ticket-draw bet");
  }
  if (result.family !== "ticket-draw") {
    throw new Error("Federal checking requires a ticket-draw result");
  }
  if (result.prizes.length !== 5) {
    throw new Error("Federal checking requires exactly five main prizes");
  }

  const ticketNumber = canonicalTicket(bet.ticketNumber);
  const prizes = result.prizes.map((prize) => ({
    position: prize.position,
    ticketNumber: canonicalTicket(prize.ticketNumber),
  }));
  const suffixPositions = (size: number): number[] => prizes
    .filter((prize) => prize.ticketNumber.slice(-size) === ticketNumber.slice(-size))
    .map((prize) => prize.position);

  const mainPrize = prizes.find((prize) => prize.ticketNumber === ticketNumber);
  return {
    product: "federal",
    ticketNumber,
    ...(mainPrize ? { mainPrizePosition: mainPrize.position } : {}),
    milharPrizePositions: suffixPositions(4),
    centenaPrizePositions: suffixPositions(3),
    dezenaPrizePositions: suffixPositions(2),
  };
}
