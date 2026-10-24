/**
 * Modelo de retorno esperado da Lotofácil (lotofacil-ev-v1).
 *
 * Duas fontes de vantagem, ambas estimadas do histórico e validadas fora da amostra:
 * 1. Viés de frequência: o sorteio tem leve desvio persistente por dezena (χ² p≈1e-4,
 *    correlação 0,47 entre metades). Usa-se o desvio encolhido por validação cruzada
 *    (fator 0.54) em um tilt de Poisson condicional para obter P(k acertos) por jogo.
 * 2. Popularidade: dezenas mais apostadas dividem os prêmios rateados (14 e 15 acertos).
 *    Mede-se por log(ganhadores_13/arrecadação) regredido nas dezenas sorteadas.
 * Procedimento e limites em docs/LOTOFACIL_PAYOUT.md.
 */
export const LOTOFACIL_MODEL = {
  id: "lotofacil-ev-v1",
  fitThroughContest: 3812,
  popularityContests: 3384,
  frequencyShrink: 0.54,
  /** Inclinação 15 acertos / escore de popularidade (OOS: 1,31 [0,68–1,86]; teoria 1,43). */
  shareCoefficient: 1.35,
  /** Faixa de 14 acertos: coeficiente OOS 1,10 × 14/15 (o jogo só acerta 14 das 15 dezenas sorteadas). */
  shareCoefficient14: 1.03,
  /** Efeito log centrado por dezena (índice 0 = dezena 1). Positivo = mais apostada. */
  popularity: [
    -0.004,  0.014,  0.040, -0.013,  0.049,
    -0.121,  0.006, -0.001,  0.013,  0.044,
     0.011,  0.006,  0.079, -0.009,  0.008,
    -0.108, -0.009,  0.000,  0.008, -0.007,
    -0.038, -0.045,  0.031,  0.013,  0.033,
  ],
  /** Tilt de Poisson condicional centrado por dezena. Positivo = sorteada acima do esperado. */
  theta: [
     0.014, -0.006,  0.007,  0.011,  0.006,
    -0.026, -0.019, -0.043, -0.007,  0.045,
     0.035,  0.003,  0.019,  0.010, -0.004,
    -0.061, -0.029, -0.013, -0.006,  0.051,
    -0.012, -0.010, -0.027,  0.018,  0.046,
  ],
  /** Fração da arrecadação paga por faixa desde 2023 (retorno médio de um jogo). */
  returns: { 11: 0.1732, 12: 0.066, 13: 0.0142, 14: 0.0213, 15: 0.1117 },
} as const;

const UNIVERSE = 25;
const DRAW = 15;
const RETURN_TIERS = [11, 12, 13, 14, 15] as const;
/** Média do evIndex bruto em 6.000 jogos uniformes (Monte Carlo): torna 1,00 a referência. */
const UNIFORM_EV_REFERENCE = 1.0058;

function elementary(values: readonly number[]): number[] {
  const d = Array.from({ length: DRAW + 1 }, () => 0);
  d[0] = 1;
  for (const value of values) for (let k = DRAW; k >= 1; k -= 1) d[k] = d[k]! + d[k - 1]! * value;
  return d;
}

/** P(k acertos | jogo de 15 dezenas) sob o tilt dado (theta=0 → uniforme). */
export function lotofacilTierProbabilities(ticket: readonly number[], theta: readonly number[]): number[] {
  const inTicket = new Set(ticket);
  let dp: number[][] = Array.from({ length: DRAW + 1 }, () => Array.from({ length: DRAW + 1 }, () => 0));
  dp[0]![0] = 1;
  for (let n = 1; n <= UNIVERSE; n += 1) {
    const weight = Math.exp(theta[n - 1]!);
    const next = Array.from({ length: DRAW + 1 }, () => Array.from({ length: DRAW + 1 }, () => 0));
    for (let hit = 0; hit <= DRAW; hit += 1) {
      for (let miss = 0; hit + miss <= DRAW; miss += 1) {
        const value = dp[hit]![miss]!;
        if (value === 0) continue;
        next[hit]![miss] = next[hit]![miss]! + value;
        if (hit + miss + 1 > DRAW) continue;
        if (inTicket.has(n)) next[hit + 1]![miss] = next[hit + 1]![miss]! + value * weight;
        else next[hit]![miss + 1] = next[hit]![miss + 1]! + value * weight;
      }
    }
    dp = next;
  }
  const probabilities = Array.from({ length: DRAW + 1 }, (_, hit) => dp[hit]![DRAW - hit]!);
  const total = probabilities.reduce((sum, value) => sum + value, 0);
  return probabilities.map((value) => value / total);
}

const UNIFORM_THETA = Array.from({ length: UNIVERSE }, () => 0);

const shareReference = new Map<number, number>();

function shareNormaliser(coefficient: number): number {
  const cached = shareReference.get(coefficient);
  if (cached !== undefined) return cached;
  const e = elementary(LOTOFACIL_MODEL.popularity.map((w) => Math.exp(coefficient * w)));
  const reference = e[DRAW]! / 3_268_760;
  shareReference.set(coefficient, reference);
  return reference;
}

/** Soma dos efeitos de popularidade; menor = menos apostado. */
export function lotofacilPopularityScore(ticket: readonly number[]): number {
  return ticket.reduce((total, number) => total + LOTOFACIL_MODEL.popularity[number - 1]!, 0);
}

/** Co-ganhadores esperados em 14/15 acertos relativos a um jogo uniforme (1,00). */
export function lotofacilShareIndex(ticket: readonly number[], tier: 14 | 15 = 15): number {
  const coefficient = tier === 15 ? LOTOFACIL_MODEL.shareCoefficient : LOTOFACIL_MODEL.shareCoefficient14;
  return Math.exp(coefficient * lotofacilPopularityScore(ticket)) / shareNormaliser(coefficient);
}

const uniformCache = new Map<string, number[]>();

export interface LotofacilTicketEvaluation {
  /** Retorno esperado relativo a um jogo uniforme (1,00). */
  evIndex: number;
  /** P(11+ acertos) sob o modelo. */
  hitRate11: number;
  shareIndex: number;
}

export function evaluateLotofacilTicket(ticket: readonly number[]): LotofacilTicketEvaluation {
  const tilted = lotofacilTierProbabilities(ticket, LOTOFACIL_MODEL.theta);
  // P uniforme depende só de |ticket|=15, então é constante.
  const uniform = uniformCache.get("15") ?? lotofacilTierProbabilities(ticket, UNIFORM_THETA);
  uniformCache.set("15", uniform);
  const share = lotofacilShareIndex(ticket);
  const share14 = lotofacilShareIndex(ticket, 14);
  let expected = 0;
  let baseline = 0;
  for (const tier of RETURN_TIERS) {
    const base = LOTOFACIL_MODEL.returns[tier];
    baseline += base;
    expected += base * (tilted[tier]! / uniform[tier]!) * (tier === 15 ? 1 / share : tier === 14 ? 1 / share14 : 1);
  }
  return {
    evIndex: expected / baseline / UNIFORM_EV_REFERENCE,
    hitRate11: RETURN_TIERS.reduce((sum, tier) => sum + tilted[tier]!, 0),
    shareIndex: share,
  };
}
