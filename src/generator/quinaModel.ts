/**
 * Modelo de retorno esperado da Quina (quina-ev-v1).
 *
 * O sorteio é compatível com uniforme (sem viés de frequência aproveitável: χ² p≈0,04,
 * encolhimento por validação cruzada 0,22), então a probabilidade de cada faixa é igual para
 * todo jogo. Todas as faixas (2 a 5 acertos) são rateadas; a vantagem vem de dividir o prêmio
 * com menos apostadores. Nas faixas 2–4 o divisor é o total de ganhadores da faixa, que cresce
 * com a popularidade das dezenas acertadas (em média k/5 do jogo); no jogo exato (5 acertos)
 * o divisor são os outros detentores do mesmo jogo. A popularidade das dezenas é estimada por
 * log(ganhadores_terno/arrecadação) regredido nas dezenas sorteadas (R² fora da amostra 0,70).
 * Procedimento e limites em docs/QUINA_PAYOUT.md.
 */
export const QUINA_MODEL = {
  id: "quina-ev-v1",
  fitThroughContest: 7150,
  popularityContests: 3474,
  /** Inclinação OOS por faixa sobre o escore de popularidade (IC95%: 2→0,70–0,87; 3→1,13–1,34; 4→1,40–1,75; 5→0,84–2,20). */
  shareCoefficients: { 2: 0.79, 3: 1.22, 4: 1.56, 5: 1.55 },
  /** Fração da arrecadação paga por faixa desde 2023. */
  returns: { 2: 0.0435, 3: 0.0436, 4: 0.0458, 5: 0.1993 },
  /** Ganhadores médios por concurso desde 2023 (escala do rateio). */
  winners: { 2: 130285.5, 3: 5346.2, 4: 71.4, 5: 0.2 },
  /** Efeito log centrado por dezena (índice 0 = dezena 1). Positivo = mais apostada. */
  popularity: [
     0.026,  0.072,  0.119,  0.141,  0.186,  0.066,  0.144,  0.094,  0.128,  0.135,
     0.086,  0.110,  0.196,  0.067,  0.076,  0.034,  0.108,  0.075,  0.177, -0.011,
    -0.011,  0.054,  0.101,  0.091,  0.048,  0.032,  0.058,  0.033,  0.021, -0.095,
    -0.055, -0.029,  0.107, -0.008,  0.036,  0.016, -0.011, -0.042, -0.047, -0.101,
    -0.106, -0.028, -0.011,  0.069,  0.047, -0.024, -0.010, -0.019, -0.010, -0.116,
    -0.081, -0.031,  0.000,  0.016,  0.010,  0.015, -0.006, -0.035, -0.063, -0.109,
    -0.160, -0.113, -0.075, -0.078, -0.076, -0.067, -0.071, -0.091, -0.073, -0.145,
    -0.109, -0.078, -0.081, -0.085, -0.073, -0.114, -0.014, -0.098, -0.073, -0.058,
  ],
} as const;

const UNIVERSE = 80;
const DRAW = 5;
const TIERS = [2, 3, 4, 5] as const;
type Tier = (typeof TIERS)[number];
/** Média de E[1/(1+K)] em jogos uniformes na faixa 5 (Monte Carlo, 100.000 jogos). */
const UNIFORM_EXACT_RELIEF = 0.9069;

export function quinaPopularityScore(ticket: readonly number[]): number {
  return ticket.reduce((total, number) => total + QUINA_MODEL.popularity[number - 1]!, 0);
}

/** Expoente do efeito de popularidade do jogo sobre os ganhadores da faixa. */
function tierExponent(tier: Tier): number {
  return (QUINA_MODEL.shareCoefficients[tier] * tier) / DRAW;
}

const referenceCache = new Map<number, number>();

/** E[exp(x·S)] para um jogo uniforme, via polinômio simétrico elementar e_5. */
function uniformMoment(exponent: number): number {
  const cached = referenceCache.get(exponent);
  if (cached !== undefined) return cached;
  const e = Array.from({ length: DRAW + 1 }, () => 0);
  e[0] = 1;
  for (const weight of QUINA_MODEL.popularity) {
    const value = Math.exp(exponent * weight);
    for (let k = DRAW; k >= 1; k -= 1) e[k] = e[k]! + e[k - 1]! * value;
  }
  const moment = e[DRAW]! / 24_040_016;
  referenceCache.set(exponent, moment);
  return moment;
}

/** Ganhadores esperados da faixa, dado que o jogo a acerta, relativos a um jogo uniforme (1,00). */
export function quinaShareIndex(ticket: readonly number[], tier: Tier): number {
  const exponent = tierExponent(tier);
  return Math.exp(exponent * quinaPopularityScore(ticket)) / uniformMoment(exponent);
}

/** E[1/(1+K)], K ~ Poisson(μ): fração do prêmio que sobra após dividir com os outros detentores. */
function relief(mu: number): number {
  return mu < 1e-9 ? 1 : (1 - Math.exp(-mu)) / mu;
}

export interface QuinaTicketEvaluation {
  /** Retorno esperado relativo a um jogo uniforme (1,00). */
  evIndex: number;
  /** Índice de ganhadores por faixa (1,00 = uniforme). */
  shareIndex: Record<Tier, number>;
}

export function evaluateQuinaTicket(ticket: readonly number[]): QuinaTicketEvaluation {
  let expected = 0;
  let baseline = 0;
  const shareIndex = { 2: 1, 3: 1, 4: 1, 5: 1 };
  for (const tier of TIERS) {
    const share = quinaShareIndex(ticket, tier);
    shareIndex[tier] = share;
    const weight = QUINA_MODEL.returns[tier];
    baseline += weight;
    if (tier === 5) {
      expected += (weight * relief(QUINA_MODEL.winners[5] * share)) / UNIFORM_EXACT_RELIEF;
    } else {
      // E[1/W] cresce com exp(-expoente·S); normaliza pelo mesmo momento sobre jogos uniformes.
      const exponent = tierExponent(tier);
      expected += (weight * Math.exp(-exponent * quinaPopularityScore(ticket))) / uniformMoment(-exponent);
    }
  }
  return { evIndex: expected / baseline, shareIndex };
}

export { UNIVERSE as QUINA_UNIVERSE };
