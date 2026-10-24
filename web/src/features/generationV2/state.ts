import type { GeneratorState, GenerationPlan, GenerationAlgorithmSpace, GenerationConstraints, GenerationFilterKey, GenerationRangeEdge, GenerationRequestPayload, GenerationPlanPayload, GenerationPurpose, LotteryId, NumberTier, SelectionMode } from "./types.js";

export const NUMBER_TIERS: readonly NumberTier[] = ["strong", "balanced", "cold"];

export function supportsExperimental(lottery: LotteryId): boolean {
  return lottery === "mega-sena" || lottery === "lotofacil" || lottery === "dia-de-sorte";
}


export function supportsPayout(lottery: LotteryId): boolean {
  return lottery === "mega-sena" || lottery === "lotofacil";
}


export function supportsCoverage(lottery: LotteryId): boolean {
  return lottery === "mega-sena" || lottery === "lotofacil" || lottery === "quina" || lottery === "dupla-sena";
}


export function isSelectionMode(value: string | undefined): value is SelectionMode {
  return value === "fix" || value === "exclude" || value === "auto";
}


export function isFilterKey(value: string | undefined): value is GenerationFilterKey {
  return value === "odd" || value === "repeated" || value === "sum";
}


export function isRangeEdge(value: string | undefined): value is GenerationRangeEdge {
  return value === "min" || value === "max";
}


export function tierByNumber(plan: GenerationPlan): Map<number, NumberTier> {
  const result = new Map<number, NumberTier>();
  for (const tier of NUMBER_TIERS) {
    for (const value of plan.numberTiers[tier] || []) result.set(value, tier);
  }
  return result;
}


export function constraintPayload(state: GeneratorState): GenerationConstraints | undefined {
  const constraints: GenerationConstraints = {};
  if (state.filters.odd.enabled) constraints.odd = { min: state.filters.odd.min, max: state.filters.odd.max };
  if (state.filters.repeated.enabled) constraints.repeated = { min: state.filters.repeated.min, max: state.filters.repeated.max };
  if (state.filters.sum.enabled) constraints.sum = { min: state.filters.sum.min, max: state.filters.sum.max };
  return Object.keys(constraints).length ? constraints : undefined;
}


export function requestPayload(state: GeneratorState, includeSeed = false): GenerationRequestPayload {
  const constraints = constraintPayload(state);
  const seed = includeSeed ? state.preview?.generatorOptions.seed : undefined;
  return {
    lottery: state.lottery,
    gameCount: state.gameCount,
    fixedCount: state.purpose === "uniform" || state.purpose === "portfolio" || state.purpose === "payout" ? state.fixed.size : state.fixedCount,
    betSize: state.betSize,
    targetContestNumber: state.targetContestNumber,
    purpose: state.purpose,
    generationMode: "diversified",
    fixedNumbers: [...state.fixed].sort((a, b) => a - b),
    excludedNumbers: [...state.excluded].sort((a, b) => a - b),
    ...(constraints ? { constraints } : {}),
    ...(state.lottery === "mais-milionaria" ? { cloverCount: state.cloverCount } : {}),
    ...(state.lottery === "timemania" && state.favoriteTeam.trim() ? { favoriteTeam: state.favoriteTeam.trim() } : {}),
    ...(state.lottery === "super-sete" ? { columnMarks: state.columnMarks } : {}),
    ...(state.purpose === "coverage" ? {
      coveragePoolNumbers: [...state.coveragePool].sort((a, b) => a - b),
      coverageTargetSize: state.coverageTargetSize,
      ...(state.coverageBudgetCents !== undefined ? { coverageBudgetCents: state.coverageBudgetCents } : {}),
    } : {}),
    ...(typeof seed === "string" && seed ? { seed } : {}),
  };
}


export function planPayload(state: GeneratorState): GenerationPlanPayload {
  const constraints = constraintPayload(state);
  return {
    lottery: state.lottery,
    betSize: state.betSize,
    targetContestNumber: state.targetContestNumber,
    fixedNumbers: [...state.fixed].sort((a, b) => a - b),
    excludedNumbers: [...state.excluded].sort((a, b) => a - b),
    ...(constraints ? { constraints } : {}),
  };
}


export function algorithmSpace(state: GeneratorState): GenerationAlgorithmSpace {
  return state.plan.algorithmSpaces[String(state.fixedCount)] || {
    fixedCount: state.fixedCount,
    candidatePoolSize: 0,
    rawCombinationCapacity: 0,
    shortlistLimit: 0,
    variableCount: state.plan.drawSize - state.fixedCount,
  };
}


export function purposeCopy(purpose: GenerationPurpose): { label: string; description: string; disclaimer: string } {
  if (purpose === "uniform") {
    return {
      label: "Aleatório auditável",
      description: "Amostragem uniforme do espaço válido com seed reproduzível.",
      disclaimer: "Frequência, score e tiers históricos não participam da seleção das combinações.",
    };
  }
  if (purpose === "portfolio") {
    return {
      label: "Carteira diversificada",
      description: "Amostra candidatos sem score histórico e prioriza menor sobreposição entre jogos.",
      disclaimer: "Diversificação amplia cobertura entre os jogos; não aumenta a chance individual de uma combinação.",
    };
  }
  if (purpose === "payout") {
    return {
      label: "Prêmio máximo (anti-rateio)",
      description: "Maximiza o retorno esperado estimado: prefere dezenas menos apostadas pelo público (menor rateio) e, na Lotofácil, um pequeno viés histórico de frequência.",
      disclaimer: "Na Mega-Sena não muda a chance de acertar; na Lotofácil o ganho de probabilidade é pequeno e estimado. É uma estimativa de valor esperado, não garantia de prêmio.",
    };
  }
  if (purpose === "coverage") {
    return {
      label: "Cobertura / Desdobramento",
      description: "Seleciona jogos por Greedy Set Cover para cobrir o máximo de subconjuntos do pool escolhido.",
      disclaimer: "Cobertura é uma propriedade combinatória. Garantia só existe quando a cobertura calculada chega a 100% e continua sendo condicional ao pool.",
    };
  }
  return {
    label: "Experimental",
    description: "Mantém as heurísticas históricas atuais para experimentação e backtest.",
    disclaimer: "Scores e frequências são hipóteses experimentais e não representam aumento comprovado de chance futura.",
  };
}


export function activeFilterCount(state: GeneratorState): number {
  return Object.values(state.filters).filter((filter) => filter.enabled).length;
}

