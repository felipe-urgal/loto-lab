# Dupla Sena — gerador "Prêmio máximo" (anti-rateio)

Mesmo propósito `payout` das outras modalidades, modelo `dupla-sena-ev-v1`. Restrito a jogos de 6 dezenas; o mesmo jogo concorre nos dois sorteios do concurso.

## Achados (3.024 concursos, 2001–2026; 1.517 com premiação completa de 8 faixas)

- Os dois sorteios são compatíveis com uniforme (χ² 64,2 e 37,0 com 49 gl; correlação entre metades 0,05 e −0,21; encolhimento por CV 0,21 e −0,30) e independentes entre si (sobreposição 1º×2º conforme hipergeométrica). Paridade, repetição e soma sem desvio. **Não há tilt de frequência.**
- Todas as faixas (3 a 6 acertos, nos dois sorteios) são rateadas. Retorno somando os dois sorteios (fração da arrecadação): 6→16,6%, 5→6,3%, 4→7,0%, 3→3,5%.
- Popularidade das dezenas (log dos ganhadores de 4 acertos por arrecadação, dois sorteios juntos): R² fora da amostra 0,71 / 0,52 / 0,15 para 3/4/5 acertos; correlação 0,95–0,97 entre as metades do histórico e 0,97 entre os pesos do 1º e do 2º sorteio. Menos apostadas: 40, 20, 31, 30, 41; mais apostadas: 13, 5, 7, 3, 9.
- Coeficientes OOS por faixa 3/4/5/6: 0,69 / 0,97 / 1,20 / 1,55 (teoria: 0,68 / 0,97 / 1,26 / 1,56).

## Modelo

- Faixas 3–5: o divisor é o total de ganhadores da faixa; dado que o jogo acerta k, entra `k/6 − (6−k)/44` do seu escore.
- Faixa 6: o divisor são os outros detentores do mesmo jogo, `E[1/(1+K)]`, K ~ Poisson(μ0·índice).
- `evIndex` = Σ_faixa retorno_médio × fator de rateio, normalizado para média 1,00 sobre jogos uniformes (verificado em teste).

## Algoritmo (`dupla-sena-payout-v1`)

1. Núcleo (`fixedCount`) = fixadas + dezenas pouco apostadas amostradas.
2. Pool de 20.000 jogos únicos amostrados com peso `exp(-8·popularidade)` (seed reproduzível), respeitando excluídas e filtros.
3. Ordena por `evIndex`; seleção gulosa com sobreposição ≤ 2 (relaxa se inviável).

Auditoria em `generatorOptions.payout`: modelo, concurso limite, `evIndex` e índice de ganhadores do jogo exato por jogo, sobreposição máxima.

## Limites

- Ganho típico ≈ +17% a +27% por jogo (retorno total passa de ≈33% para ≈40% da arrecadação); continua negativo.
- A faixa de 6 acertos é rara e de alta variância; a maior parte do ganho vem das faixas 4 e 5.
- Reajuste: `node scripts/fitDuplaSenaModel.mjs [baseUrl]`.
