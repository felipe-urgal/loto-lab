/**
 * Modelo de popularidade das dezenas da Mega-Sena entre os apostadores.
 *
 * Não modela o sorteio (que é uniforme), e sim o comportamento de quem aposta:
 * a contagem de ganhadores da quadra por valor arrecadado, regredida nas dezenas
 * sorteadas, revela quais dezenas são mais jogadas. Como o sorteio é exógeno, a
 * estimativa não sofre viés de seleção. Procedimento em docs/MEGA_SENA_PAYOUT.md.
 */
export const MEGA_POPULARITY_MODEL = {
  id: "mega-popularity-v1",
  fitThroughContest: 3073,
  contestsUsed: 2004,
  method: "ridge(lambda=30) de log(ganhadores_quadra/arrecadacao), efeito fixo por ano",
  /** Calibração (inclinação in-sample 1,16 × razão 6/4 entre sena e quadra). */
  shareCoefficient: 1.74,
  outOfSampleR2: 0.69,
  /** Efeito log centrado por dezena (índice 0 = dezena 1). Positivo = mais apostada. */
  weights: [
    0.017, 0.109, 0.165, 0.091, 0.208, 0.078, 0.183, 0.102, 0.124, 0.139,
    0.085, 0.119, 0.208, 0.033, 0.032, -0.012, 0.137, 0.058, 0.112, -0.074,
    -0.029, 0.020, 0.087, 0.083, 0.056, -0.048, 0.083, 0.008, -0.020, -0.119,
    -0.110, -0.056, 0.087, -0.034, -0.021, -0.006, -0.013, -0.061, -0.089, -0.189,
    -0.159, -0.039, -0.059, -0.037, -0.032, -0.071, -0.049, -0.054, -0.065, -0.182,
    -0.085, -0.118, -0.072, -0.075, -0.080, -0.044, -0.057, -0.076, -0.092, -0.095,
  ],
} as const;

export function megaSenaPopularityWeight(number: number): number {
  const weight = MEGA_POPULARITY_MODEL.weights[number - 1];
  if (weight === undefined) throw new Error(`Mega-Sena number out of range: ${number}`);
  return weight;
}

/** Soma dos efeitos de popularidade; menor = menos apostada = menos rateio esperado. */
export function megaSenaPopularityScore(numbers: readonly number[]): number {
  return numbers.reduce((total, number) => total + megaSenaPopularityWeight(number), 0);
}

let uniformReference: number | undefined;

/** E[exp(c·S)] para uma sena uniforme, via polinômio simétrico elementar e_6. */
function uniformShareReference(): number {
  if (uniformReference !== undefined) return uniformReference;
  const x = MEGA_POPULARITY_MODEL.weights.map((w) => Math.exp(MEGA_POPULARITY_MODEL.shareCoefficient * w));
  const e = [1, 0, 0, 0, 0, 0, 0];
  for (const value of x) {
    for (let k = 6; k >= 1; k -= 1) e[k] = e[k]! + e[k - 1]! * value;
  }
  uniformReference = e[6]! / 50_063_860;
  return uniformReference;
}

/**
 * Índice relativo de co-ganhadores esperados numa sena: 1,00 = jogo sorteado
 * uniformemente; 0,50 = metade do rateio esperado. Estimativa de primeira ordem.
 */
export function megaSenaShareIndex(numbers: readonly number[]): number {
  return Math.exp(MEGA_POPULARITY_MODEL.shareCoefficient * megaSenaPopularityScore(numbers)) / uniformShareReference();
}
