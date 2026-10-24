# Quina — gerador "Prêmio máximo" (anti-rateio)

Mesmo propósito `payout` da Mega-Sena e da Lotofácil, modelo `quina-ev-v1`. Restrito a jogos de 5 dezenas.

## Achados (7.150 concursos, 1994–2026; 3.474 com dados de premiação)

- Sorteio compatível com uniforme: paridade, repetição, soma, décadas, consecutivos. Frequência por dezena tem χ² 101,8/79 gl (p≈0,04), correlação 0,14 entre metades e encolhimento por CV de 0,22: sem viés aproveitável. "Quente/frio" sem sinal (0,32 vs 0,3125 ± 0,008). **Não há tilt de frequência**; a probabilidade de cada faixa é a mesma para todo jogo.
- **Todas** as faixas são rateadas (retorno desde 2023: 5 acertos 19,9%, 4 acertos 4,6%, 3 acertos 4,4%, 2 acertos 4,4% da arrecadação).
- Popularidade das dezenas, medida por `log(ganhadores_terno/arrecadação)`: R² fora da amostra 0,81 / 0,70 / 0,44 para 2/3/4 acertos; correlação 0,97 entre as metades do histórico. Mais apostadas: 13, 5, 19, 7, 4, 10; menos: 61, 70, 50, 76, 62.
- Inclinações OOS por faixa sobre o escore (2→0,79; 3→1,22; 4→1,56; 5→1,55) batem com a teoria (k/3 × ajuste de encolhimento).

## Modelo

- Faixas 2–4: o divisor é o total de ganhadores da faixa, que depende das dezenas sorteadas. Dado que o jogo acerta k, em média k/5 do seu escore entra na popularidade do sorteio; expoente `coef·k/5`.
- Faixa 5: o divisor são os outros detentores do mesmo jogo, `E[1/(1+K)]`, K ~ Poisson(μ0·índice), μ0 = ganhadores médios por concurso.
- `evIndex` = Σ_faixa retorno_médio × fator de rateio, normalizado para média 1,00 sobre jogos uniformes (verificado em teste).

## Algoritmo (`quina-payout-v1`)

1. Núcleo (`fixedCount`) = fixadas + dezenas pouco apostadas amostradas.
2. Pool de 20.000 jogos únicos amostrados com peso `exp(-10·popularidade)` (seed reproduzível), respeitando excluídas e filtros.
3. Ordena por `evIndex`; seleção gulosa com sobreposição ≤ 2 (relaxa se inviável).

Auditoria em `generatorOptions.payout`: modelo, concurso limite, `evIndex` e índice de ganhadores do jogo exato por jogo, sobreposição máxima.

## Limites

- Os melhores jogos atingem `evIndex` ≈ 1,26–1,31 (≈ +30% de retorno esperado, de ≈33% para ≈43% da arrecadação). Continua negativo.
- A faixa de 5 acertos tem IC largo (0,84–2,20) e muita variância; a maior parte do ganho vem das faixas 3 e 4.
- O público pode mudar de comportamento: reajustar com `node scripts/fitQuinaModel.mjs [baseUrl]`.
