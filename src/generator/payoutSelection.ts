/**
 * Escolhe o lote de um gerador de payout a partir do pool ordenado do melhor para o pior.
 * Pegar sempre os primeiros faria toda seed devolver as mesmas dezenas; por isso o sorteio
 * (seeded) acontece dentro de uma janela dos melhores candidatos, respeitando o teto de
 * sobreposição entre jogos. Devolve `undefined` quando nenhum teto até `maxCap` comporta o lote.
 */
export function selectDiversifiedBatch<T extends { numbers: number[] }>(
  sortedPool: readonly T[],
  count: number,
  random: () => number,
  initialCap: number,
  maxCap: number,
): T[] | undefined {
  const windowSize = Math.min(sortedPool.length, Math.max(count * 25, Math.ceil(sortedPool.length * 0.1)));
  const overlap = (left: number[], right: number[]) => left.filter((number) => right.includes(number)).length;
  const selected: T[] = [];
  let cap = initialCap;
  while (selected.length < count) {
    const fits = (candidate: T) =>
      !selected.includes(candidate) && selected.every((game) => overlap(game.numbers, candidate.numbers) <= cap);
    let eligible = sortedPool.slice(0, windowSize).filter(fits);
    if (eligible.length === 0) eligible = sortedPool.filter(fits);
    if (eligible.length > 0) {
      selected.push(eligible[Math.floor(random() * eligible.length)]!);
    } else if (cap < maxCap) {
      cap += 1;
    } else {
      return undefined;
    }
  }
  return selected;
}
