/**
 * Modelo de retorno esperado da Dupla Sena (dupla-sena-ev-v1).
 *
 * Os dois sorteios do concurso são uniformes e independentes (χ² 64,2 e 37,0 com 49 gl; sem
 * estabilidade entre metades), então a probabilidade de cada faixa é igual para todo jogo e o
 * mesmo jogo concorre nos dois sorteios. Todas as faixas (3 a 6 acertos) são rateadas; a
 * vantagem vem de dividir o prêmio com menos apostadores. A popularidade das dezenas é estimada
 * por log(ganhadores_quadra/arrecadação) regredido nas dezenas de cada sorteio (R² fora da
 * amostra 0,52). Procedimento e limites em docs/DUPLA_SENA_PAYOUT.md.
 */
export const DUPLA_SENA_MODEL = {
  id: "dupla-sena-ev-v1",
  fitThroughContest: 3024,
  popularityContests: 1517,
  /** Inclinação OOS por faixa sobre o escore completo do sorteio (IC95%: 3→0,60–0,77; 4→0,84–1,11; 5→0,96–1,48; 6→limitado pela teoria). */
  shareCoefficients: { 3: 0.69, 4: 0.97, 5: 1.2, 6: 1.55 },
  /** Fração da arrecadação paga por faixa, somando os dois sorteios. */
  returns: { 3: 0.0347, 4: 0.0695, 5: 0.0627, 6: 0.1657 },
  /** Ganhadores médios por sorteio (escala do rateio). */
  winners: { 3: 20607.8, 4: 1108, 5: 20.5, 6: 0.1 },
  /** Efeito log centrado por dezena (índice 0 = dezena 1). Positivo = mais apostada. */
  popularity: [
    -0.077,  0.006,  0.084,  0.053,  0.102,  0.038,  0.093,  0.034,  0.067,  0.047,
     0.019,  0.056,  0.106,  0.026, -0.004, -0.030,  0.060,  0.007,  0.062, -0.098,
    -0.056, -0.001,  0.029,  0.026,  0.042, -0.031,  0.035, -0.021, -0.027, -0.093,
    -0.096, -0.063,  0.064, -0.032, -0.028, -0.011, -0.050, -0.043, -0.063, -0.168,
    -0.078, -0.008, -0.011,  0.008,  0.032, -0.027, -0.009, -0.008,  0.026,  0.013,
  ],
} as const;

const DRAW = 6;
const UNIVERSE = 50;
const COMBINATIONS = 15_890_700;
const TIERS = [3, 4, 5, 6] as const;
type Tier = (typeof TIERS)[number];
/** Média de E[1/(1+K)] em jogos uniformes na faixa 6 (Monte Carlo, 100.000 jogos). */
const UNIFORM_EXACT_RELIEF = 0.9517;

export function duplaSenaPopularityScore(ticket: readonly number[]): number {
  return ticket.reduce((total, number) => total + DUPLA_SENA_MODEL.popularity[number - 1]!, 0);
}

/**
 * Peso do escore do jogo nos ganhadores da faixa k: dos 6 números sorteados, k vêm do jogo
 * (k/6 do escore) e os demais saem do complemento (média -escore/44).
 */
function matchedFraction(tier: number): number {
  return tier / DRAW - (DRAW - tier) / (UNIVERSE - DRAW);
}

function tierExponent(tier: Tier): number {
  return DUPLA_SENA_MODEL.shareCoefficients[tier] * matchedFraction(tier);
}

const momentCache = new Map<number, number>();

/** E[exp(x·S)] para um jogo uniforme, via polinômio simétrico elementar e_6. */
function uniformMoment(exponent: number): number {
  const cached = momentCache.get(exponent);
  if (cached !== undefined) return cached;
  const e = Array.from({ length: DRAW + 1 }, () => 0);
  e[0] = 1;
  for (const weight of DUPLA_SENA_MODEL.popularity) {
    const value = Math.exp(exponent * weight);
    for (let k = DRAW; k >= 1; k -= 1) e[k] = e[k]! + e[k - 1]! * value;
  }
  const moment = e[DRAW]! / COMBINATIONS;
  momentCache.set(exponent, moment);
  return moment;
}

/** Ganhadores esperados da faixa, dado que o jogo a acerta, relativos a um jogo uniforme (1,00). */
export function duplaSenaShareIndex(ticket: readonly number[], tier: Tier): number {
  const exponent = tierExponent(tier);
  return Math.exp(exponent * duplaSenaPopularityScore(ticket)) / uniformMoment(exponent);
}

/** E[1/(1+K)], K ~ Poisson(μ): fração do prêmio que sobra após dividir com os outros detentores. */
function relief(mu: number): number {
  return mu < 1e-9 ? 1 : (1 - Math.exp(-mu)) / mu;
}

export interface DuplaSenaTicketEvaluation {
  /** Retorno esperado relativo a um jogo uniforme (1,00). */
  evIndex: number;
  /** Índice de ganhadores por faixa (1,00 = uniforme). */
  shareIndex: Record<Tier, number>;
}

export function evaluateDuplaSenaTicket(ticket: readonly number[]): DuplaSenaTicketEvaluation {
  const { returns, winners } = DUPLA_SENA_MODEL;
  const score = duplaSenaPopularityScore(ticket);
  let expected = 0;
  let baseline = 0;
  const shareIndex = { 3: 1, 4: 1, 5: 1, 6: 1 };
  for (const tier of TIERS) {
    const share = duplaSenaShareIndex(ticket, tier);
    shareIndex[tier] = share;
    baseline += returns[tier];
    if (tier === 6) {
      expected += (returns[6] * relief(winners[6] * share)) / UNIFORM_EXACT_RELIEF;
    } else {
      // E[1/W] cresce com exp(-expoente·S); normaliza pelo mesmo momento sobre jogos uniformes.
      const exponent = tierExponent(tier);
      expected += (returns[tier] * Math.exp(-exponent * score)) / uniformMoment(-exponent);
    }
  }
  return { evIndex: expected / baseline, shareIndex };
}
