/**
 * Modelo de retorno esperado da Timemania (timemania-ev-v1).
 *
 * O sorteio é compatível com uniforme (χ² 78,8/79 gl; sem estabilidade entre metades), então a
 * probabilidade de cada faixa é igual para todo jogo de 10 dezenas. Prêmios de 3 e 4 acertos e do
 * Time do Coração são fixos; 5, 6 e 7 acertos são rateados. A vantagem vem de dividir esses
 * prêmios com menos apostadores. Popularidade estimada por log(ganhadores_4_acertos/arrecadação)
 * regredido nas dezenas sorteadas (R² fora da amostra 0,59). O Time do Coração não altera o
 * valor esperado (prêmio fixo, sorteio uniforme). Procedimento e limites em docs/TIMEMANIA_PAYOUT.md.
 */
export const TIMEMANIA_MODEL = {
  id: "timemania-ev-v1",
  fitThroughContest: 2458,
  popularityContests: 2402,
  /**
   * Inclinação OOS sobre o escore completo do sorteio (IC95%: 5→1,33–1,67; 6→1,03–2,00); a de
   * 7 acertos é extrapolada linearmente e fica próxima do limite superior do IC de 6.
   */
  shareCoefficients: { 5: 1.49, 6: 1.55, 7: 1.8 },
  /** Fração da arrecadação paga por faixa (histórico com premiação completa). */
  returns: { 3: 0.0345, 4: 0.0108, 5: 0.0778, 6: 0.053, 7: 0.1627, team: 0.0302 },
  /** Ganhadores médios por concurso na faixa de 7 acertos (escala do rateio do jogo exato). */
  winners7: 0.03,
  /** Efeito log centrado por dezena (índice 0 = dezena 1). Positivo = mais apostada. */
  popularity: [
     0.011,  0.020,  0.059,  0.045,  0.080,  0.018,  0.073,  0.043,  0.053,  0.090,
     0.046,  0.067,  0.103,  0.014,  0.026,  0.016,  0.055,  0.007,  0.092, -0.007,
    -0.016,  0.006,  0.035,  0.030,  0.034, -0.005,  0.035,  0.024,  0.005, -0.053,
    -0.041, -0.033,  0.050, -0.019,  0.007,  0.001, -0.021, -0.034, -0.022, -0.065,
    -0.050, -0.021, -0.005,  0.018,  0.013, -0.023, -0.004, -0.005, -0.004, -0.041,
    -0.034, -0.016, -0.006, -0.001,  0.011,  0.013,  0.005, -0.016, -0.022, -0.048,
    -0.080, -0.045, -0.017, -0.034, -0.038, -0.023, -0.031, -0.043, -0.020, -0.082,
    -0.024, -0.027, -0.027, -0.028, -0.018, -0.045,  0.017, -0.044, -0.017,  0.034,
  ],
} as const;

const DRAW = 7;
const BET = 10;
const UNIVERSE = 80;
const COMBINATIONS = 1_646_492_110_120;
type SharedTier = 5 | 6 | 7;
const SHARED_TIERS = [5, 6, 7] as const;

export function timemaniaPopularityScore(ticket: readonly number[]): number {
  return ticket.reduce((total, number) => total + TIMEMANIA_MODEL.popularity[number - 1]!, 0);
}

/**
 * Peso do escore do jogo nos ganhadores da faixa k: dos 7 sorteados, k vêm do jogo de 10 dezenas
 * (k/10 do escore) e os demais do complemento (média -escore/70).
 */
function matchedFraction(tier: number): number {
  return tier / BET - (DRAW - tier) / (UNIVERSE - BET);
}

function tierExponent(tier: SharedTier): number {
  return TIMEMANIA_MODEL.shareCoefficients[tier] * matchedFraction(tier);
}

const momentCache = new Map<number, number>();

/** E[exp(x·S)] para um jogo uniforme de 10 dezenas, via polinômio simétrico elementar e_10. */
function uniformMoment(exponent: number): number {
  const cached = momentCache.get(exponent);
  if (cached !== undefined) return cached;
  const e = Array.from({ length: BET + 1 }, () => 0);
  e[0] = 1;
  for (const weight of TIMEMANIA_MODEL.popularity) {
    const value = Math.exp(exponent * weight);
    for (let k = BET; k >= 1; k -= 1) e[k] = e[k]! + e[k - 1]! * value;
  }
  const moment = e[BET]! / COMBINATIONS;
  momentCache.set(exponent, moment);
  return moment;
}

/** Ganhadores esperados da faixa, dado que o jogo a acerta, relativos a um jogo uniforme (1,00). */
export function timemaniaShareIndex(ticket: readonly number[], tier: SharedTier): number {
  const exponent = tierExponent(tier);
  return Math.exp(exponent * timemaniaPopularityScore(ticket)) / uniformMoment(exponent);
}

/** E[1/(1+K)], K ~ Poisson(μ): fração do prêmio que sobra após dividir com os outros detentores. */
function relief(mu: number): number {
  return mu < 1e-9 ? 1 : (1 - Math.exp(-mu)) / mu;
}

/** Média de E[1/(1+K)] na faixa de 7 acertos sobre jogos uniformes: 1 − μ0/2 (μ0 ≈ 0,03). */
const UNIFORM_EXACT_RELIEF = 0.985;

export interface TimemaniaTicketEvaluation {
  /** Retorno esperado relativo a um jogo uniforme (1,00). */
  evIndex: number;
  /** Índice de ganhadores por faixa rateada (1,00 = uniforme). */
  shareIndex: Record<SharedTier, number>;
}

export function evaluateTimemaniaTicket(ticket: readonly number[]): TimemaniaTicketEvaluation {
  const { returns } = TIMEMANIA_MODEL;
  const score = timemaniaPopularityScore(ticket);
  const total = returns[3] + returns[4] + returns[5] + returns[6] + returns[7] + returns.team;
  let expected = returns[3] + returns[4] + returns.team;
  const shareIndex = { 5: 1, 6: 1, 7: 1 };
  for (const tier of SHARED_TIERS) {
    const share = timemaniaShareIndex(ticket, tier);
    shareIndex[tier] = share;
    if (tier === 7) {
      expected += (returns[7] * relief(TIMEMANIA_MODEL.winners7 * share)) / UNIFORM_EXACT_RELIEF;
    } else {
      // E[1/W] cresce com exp(-expoente·S); normaliza pelo mesmo momento sobre jogos uniformes.
      const exponent = tierExponent(tier);
      expected += (returns[tier] * Math.exp(-exponent * score)) / uniformMoment(-exponent);
    }
  }
  return { evIndex: expected / total, shareIndex };
}
