# +Milionária — gerador "Prêmio máximo" (anti-rateio)

Mesmo propósito `payout` das outras modalidades, modelo `mais-milionaria-ev-v1`. Restrito a jogos de 6 dezenas; `cloverCount` (2 a 6) é respeitado e não altera o valor esperado relativo.

## Achados (400 concursos, 2022–2026; todos com premiação completa de 10 faixas)

- Dezenas (χ² 59,5/49 gl) e trevos (χ² 1,2/5 gl; os 15 pares ocorrem) compatíveis com sorteio uniforme; soma sem desvio. **Não há tilt de frequência.**
- Prêmios fixos: 2 e 3 dezenas, com e sem trevo (R$ 6, 12, 24, 50; ≈ 12,9% da arrecadação). Rateados: 4 e 5 dezenas (≈ 8,3%) e 6 dezenas (≈ 11,1%, quase todo jackpot acumulado de 6+2).
- Popularidade das dezenas (log dos ganhadores de 3 dezenas por arrecadação, dezenas e trevos juntos, λ=3): R² fora da amostra 0,74 / 0,81 / 0,51 para 3/2/4 dezenas; correlação 0,79–0,89 entre as metades do histórico. Menos apostadas: 40, 35, 36, 30, 26; mais apostadas: 5, 17, 13, 12, 7. Efeito dos trevos desprezível (±0,03): fora do escore.
- Coeficientes OOS por faixa 2/3/4/5 dezenas: 0,62 / 1,19 / 1,67 / 2,39 [1,36–3,34] (teoria escalada: 0,67 / 1,19 / 1,71 / 2,24).

## Modelo

- Faixas 4–5: o divisor é o total de ganhadores da faixa; dado que o jogo acerta k, entra `k/6 − (6−k)/44` do seu escore. Coeficientes usados: 4→1,67; 5→2,24 (teoria, dentro do IC).
- Faixa de 6 dezenas e faixas fixas: fator 1 (a divisão do jackpot entre detentores do mesmo jogo é pequena e não é validável com 400 concursos).
- `evIndex` = Σ_faixa retorno_médio × fator de rateio, normalizado para média 1,00 sobre jogos uniformes (verificado em teste).

## Algoritmo (`mais-milionaria-payout-v1`)

1. Núcleo (`fixedCount`) = fixadas + dezenas pouco apostadas amostradas.
2. Pool de 20.000 jogos únicos amostrados com peso `exp(-12·popularidade)` (seed reproduzível), respeitando excluídas e filtros.
3. Ordena por `evIndex`; seleção gulosa com sobreposição ≤ 2 (relaxa se inviável).
4. Trevos: sorteados com a seed, diferentes entre jogos quando possível (uniformes, sem efeito de valor esperado).

Auditoria em `generatorOptions.payout`: modelo, concurso limite, `evIndex` e índice de ganhadores da faixa de 5 dezenas por jogo, sobreposição máxima.

## Limites

- Ganho típico ≈ +12% a +16% por jogo; o retorno total (≈ 32% da arrecadação) continua muito abaixo de 100%.
- Só 400 concursos: reajustar a cada novo trimestre com `node scripts/fitMaisMilionariaModel.mjs [baseUrl]`. A parte do ganho que vem da faixa de 5 dezenas tem IC largo.
