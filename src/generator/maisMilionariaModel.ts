/**
 * Modelo de retorno esperado da +Milionária (mais-milionaria-ev-v1).
 *
 * Dezenas e trevos são compatíveis com sorteio uniforme (χ² 59,5/49 gl e 1,2/5 gl), então a
 * probabilidade de cada faixa é igual para todo jogo. Os prêmios de 2 e 3 dezenas são fixos;
 * 4 e 5 dezenas são rateados pelo total de ganhadores da faixa, que cresce com a popularidade
 * das dezenas acertadas. A faixa de 6 dezenas (jackpot acumulado) é mantida neutra: o ganho de
 * dividir com menos detentores é pequeno e não é validável com 400 concursos. Popularidade
 * estimada por log(ganhadores_3_dezenas/arrecadação) regredido nas dezenas e nos trevos
 * sorteados (R² fora da amostra 0,74). O efeito dos trevos é desprezível (±0,03) e fica de
 * fora do escore. Procedimento e limites em docs/MAIS_MILIONARIA_PAYOUT.md.
 */
export const MAIS_MILIONARIA_MODEL = {
  id: "mais-milionaria-ev-v1",
  fitThroughContest: 400,
  popularityContests: 400,
  /** Inclinação OOS sobre o escore completo do sorteio (IC95%: 4→1,41–1,97; 5→1,36–3,34 ⇒ teoria 2,24). */
  shareCoefficients: { 4: 1.67, 5: 2.24 },
  /** Fração da arrecadação paga por número de dezenas acertadas (com e sem trevos). */
  returns: { 2: 0.085, 3: 0.0444, 4: 0.0331, 5: 0.0501, 6: 0.1112 },
  /** Efeito log centrado por dezena (índice 0 = dezena 1). Positivo = mais apostada. */
  popularity: [
    -0.018,  0.017,  0.047,  0.024,  0.076, -0.007,  0.054,  0.008,  0.029,  0.026,
     0.043,  0.060,  0.062, -0.009, -0.013, -0.028,  0.066,  0.030,  0.042, -0.032,
    -0.008,  0.038,  0.040,  0.028,  0.004, -0.045,  0.012,  0.001, -0.011, -0.051,
    -0.022, -0.036,  0.058, -0.041, -0.060, -0.053, -0.041, -0.027, -0.042, -0.074,
    -0.041, -0.020, -0.039, -0.001, -0.035, -0.030, -0.011, -0.030, -0.002,  0.063,
  ],
} as const;

const DRAW = 6;
const UNIVERSE = 50;
const COMBINATIONS = 15_890_700;
type SharedTier = 4 | 5;

export function maisMilionariaPopularityScore(ticket: readonly number[]): number {
  return ticket.reduce((total, number) => total + MAIS_MILIONARIA_MODEL.popularity[number - 1]!, 0);
}

/** Dos 6 números sorteados, k vêm do jogo (k/6 do escore) e os demais do complemento (média -escore/44). */
function matchedFraction(tier: number): number {
  return tier / DRAW - (DRAW - tier) / (UNIVERSE - DRAW);
}

function tierExponent(tier: SharedTier): number {
  return MAIS_MILIONARIA_MODEL.shareCoefficients[tier] * matchedFraction(tier);
}

const momentCache = new Map<number, number>();

/** E[exp(x·S)] para um jogo uniforme, via polinômio simétrico elementar e_6. */
function uniformMoment(exponent: number): number {
  const cached = momentCache.get(exponent);
  if (cached !== undefined) return cached;
  const e = Array.from({ length: DRAW + 1 }, () => 0);
  e[0] = 1;
  for (const weight of MAIS_MILIONARIA_MODEL.popularity) {
    const value = Math.exp(exponent * weight);
    for (let k = DRAW; k >= 1; k -= 1) e[k] = e[k]! + e[k - 1]! * value;
  }
  const moment = e[DRAW]! / COMBINATIONS;
  momentCache.set(exponent, moment);
  return moment;
}

/** Ganhadores esperados da faixa, dado que o jogo a acerta, relativos a um jogo uniforme (1,00). */
export function maisMilionariaShareIndex(ticket: readonly number[], tier: SharedTier): number {
  const exponent = tierExponent(tier);
  return Math.exp(exponent * maisMilionariaPopularityScore(ticket)) / uniformMoment(exponent);
}

export interface MaisMilionariaTicketEvaluation {
  /** Retorno esperado relativo a um jogo uniforme (1,00). */
  evIndex: number;
  /** Índice de ganhadores por faixa rateada (1,00 = uniforme). */
  shareIndex: Record<SharedTier, number>;
}

export function evaluateMaisMilionariaTicket(ticket: readonly number[]): MaisMilionariaTicketEvaluation {
  const { returns } = MAIS_MILIONARIA_MODEL;
  const score = maisMilionariaPopularityScore(ticket);
  const total = returns[2] + returns[3] + returns[4] + returns[5] + returns[6];
  let expected = returns[2] + returns[3] + returns[6];
  for (const tier of [4, 5] as const) {
    const exponent = tierExponent(tier);
    // E[1/W] cresce com exp(-expoente·S); normaliza pelo mesmo momento sobre jogos uniformes.
    expected += (returns[tier] * Math.exp(-exponent * score)) / uniformMoment(-exponent);
  }
  return {
    evIndex: expected / total,
    shareIndex: { 4: maisMilionariaShareIndex(ticket, 4), 5: maisMilionariaShareIndex(ticket, 5) },
  };
}
