/**
 * Modelo de retorno esperado do Dia de Sorte (dia-de-sorte-ev-v1).
 *
 * O sorteio é compatível com uniforme (χ² 31,2/30 gl; sem estabilidade entre metades; Mês da
 * Sorte uniforme), então a probabilidade de cada faixa é igual para todo jogo. Os prêmios de 5
 * acertos, 4 acertos e Mês da Sorte são fixos; só 7 e 6 acertos são rateados. A vantagem vem de
 * dividir esses dois prêmios com menos apostadores. Como as 31 dezenas são todas "datas", a
 * amplitude da popularidade é pequena. Estimada por log(ganhadores_5/arrecadação) regredido nas
 * dezenas sorteadas (R² fora da amostra 0,31). Procedimento e limites em docs/DIA_DE_SORTE_PAYOUT.md.
 */
export const DIA_DE_SORTE_MODEL = {
  id: "dia-de-sorte-ev-v1",
  fitThroughContest: 1330,
  popularityContests: 1330,
  /**
   * Inclinação sobre o escore completo do sorteio, limitada pela teoria (coef. OOS da faixa de
   * 5 acertos 1,26 × razão teórica): 6→1,63 (OOS 1,43–2,25), 7→1,99 (OOS 1,57–5,20).
   */
  shareCoefficients: { 6: 1.63, 7: 1.99 },
  /** Fração da arrecadação paga por faixa (histórico completo). */
  returns: { 4: 0.0538, 5: 0.022, 6: 0.0609, 7: 0.1347, month: 0.0836 },
  /** Ganhadores médios por concurso (escala do rateio). */
  winners: { 6: 64, 7: 0.4 },
  /** Efeito log centrado por dezena (índice 0 = dezena 1). Positivo = mais apostada. */
  popularity: [
    -0.094, -0.005,  0.050,  0.025,  0.039, -0.009,  0.091,  0.009,
     0.025,  0.047, -0.034,  0.015,  0.054, -0.026, -0.012, -0.044,
     0.049, -0.011,  0.025, -0.061, -0.086, -0.037,  0.017,  0.007,
    -0.008, -0.049,  0.024,  0.024,  0.024,  0.009, -0.059,
  ],
} as const;

const DRAW = 7;
const UNIVERSE = 31;
const COMBINATIONS = 2_629_575;
type SharedTier = 6 | 7;
/** Média de E[1/(1+K)] em jogos uniformes na faixa 7 (Monte Carlo, 100.000 jogos). */
const UNIFORM_EXACT_RELIEF = 0.8251;

export function diaDeSortePopularityScore(ticket: readonly number[]): number {
  return ticket.reduce((total, number) => total + DIA_DE_SORTE_MODEL.popularity[number - 1]!, 0);
}

/**
 * Peso do escore do jogo nos ganhadores da faixa k: das 7 dezenas sorteadas, k vêm do jogo
 * (k/7 do escore) e as demais saem do complemento (média -escore/24).
 */
function matchedFraction(tier: number): number {
  return tier / DRAW - (DRAW - tier) / (UNIVERSE - DRAW);
}

function tierExponent(tier: SharedTier): number {
  return DIA_DE_SORTE_MODEL.shareCoefficients[tier] * matchedFraction(tier);
}

const momentCache = new Map<number, number>();

/** E[exp(x·S)] para um jogo uniforme, via polinômio simétrico elementar e_7. */
function uniformMoment(exponent: number): number {
  const cached = momentCache.get(exponent);
  if (cached !== undefined) return cached;
  const e = Array.from({ length: DRAW + 1 }, () => 0);
  e[0] = 1;
  for (const weight of DIA_DE_SORTE_MODEL.popularity) {
    const value = Math.exp(exponent * weight);
    for (let k = DRAW; k >= 1; k -= 1) e[k] = e[k]! + e[k - 1]! * value;
  }
  const moment = e[DRAW]! / COMBINATIONS;
  momentCache.set(exponent, moment);
  return moment;
}

/** Ganhadores esperados da faixa, dado que o jogo a acerta, relativos a um jogo uniforme (1,00). */
export function diaDeSorteShareIndex(ticket: readonly number[], tier: SharedTier): number {
  const exponent = tierExponent(tier);
  return Math.exp(exponent * diaDeSortePopularityScore(ticket)) / uniformMoment(exponent);
}

/** E[1/(1+K)], K ~ Poisson(μ): fração do prêmio que sobra após dividir com os outros detentores. */
function relief(mu: number): number {
  return mu < 1e-9 ? 1 : (1 - Math.exp(-mu)) / mu;
}

export interface DiaDeSorteTicketEvaluation {
  /** Retorno esperado relativo a um jogo uniforme (1,00). */
  evIndex: number;
  /** Índice de ganhadores por faixa rateada (1,00 = uniforme). */
  shareIndex: Record<SharedTier, number>;
}

export function evaluateDiaDeSorteTicket(ticket: readonly number[]): DiaDeSorteTicketEvaluation {
  const { returns, winners } = DIA_DE_SORTE_MODEL;
  const score = diaDeSortePopularityScore(ticket);
  const share7 = diaDeSorteShareIndex(ticket, 7);
  const share6 = diaDeSorteShareIndex(ticket, 6);
  const fixed = returns[4] + returns[5] + returns.month;
  const exponent6 = tierExponent(6);
  const expected =
    fixed
    + returns[7] * (relief(winners[7] * share7) / UNIFORM_EXACT_RELIEF)
    // E[1/W] cresce com exp(-expoente·S); normaliza pelo mesmo momento sobre jogos uniformes.
    + (returns[6] * Math.exp(-exponent6 * score)) / uniformMoment(-exponent6);
  return {
    evIndex: expected / (fixed + returns[6] + returns[7]),
    shareIndex: { 6: share6, 7: share7 },
  };
}
