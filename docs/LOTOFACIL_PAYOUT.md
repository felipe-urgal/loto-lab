# Lotofácil — gerador "Prêmio máximo" (retorno esperado)

Mesmo propósito `payout` da Mega-Sena (ver `docs/MEGA_SENA_PAYOUT.md`), com um modelo próprio (`lotofacil-ev-v1`). Restrito a jogos de 15 dezenas.

## Achados (3.812 concursos, 2003–2026)

- Paridade, repetição do concurso anterior, soma, linhas/colunas, consecutivos e autocorrelação: compatíveis com sorteio uniforme.
- **Frequência por dezena não é perfeitamente uniforme**: χ² ≈ 57 em 24 gl (maior que o máximo de 200 simulações uniformes), desvio persistente (correlação 0,47 entre as metades do histórico), de −4,7% (dezena 16) a +3,9% (dezena 20). Magnitude pequena.
- Fora da amostra (ajuste na 1ª metade, avaliação na 2ª): top-15 por frequência faz +0,08 acertos em média (z≈2,9) e P(11+) sobe de 10,6% para ~12%. Walk-forward com janela longa: +0,03 a +0,06. Janelas curtas (20–300 concursos), "quente/frio", não têm sinal.
- **Popularidade**: ganhadores por arrecadação em 11–14 acertos dependem das dezenas sorteadas (R² fora da amostra 0,37 / 0,31 / 0,18 / 0,09 para 11/12/13/14). Mais apostadas: 13, 5, 10, 3; menos: 6, 16, 22, 21. Validação em tercis (OOS) dos coeficientes por faixa 12/13/14/15: 0,69 / 0,95 / 1,10 / 1,31, contra 0,71 / 0,95 / 1,19 / 1,43 previstos pela teoria.
- Retorno por faixa (fração da arrecadação, desde 2023): 11→17,3%, 12→6,6%, 13→1,4% (prêmios fixos), 14→2,1%, 15→11,2% (rateados).

## Modelo

- Tilt de Poisson condicional sobre o desvio de frequência **encolhido** por validação cruzada em 10 blocos (fator 0,54), que fornece `P(k acertos)` exata por jogo via DP.
- Índice de rateio `exp(c·Σpopularidade)/E_uniforme`, com c=1,35 para 15 acertos e c=1,03 (=1,10·14/15) para 14 acertos.
- `evIndex` = retorno esperado relativo a um jogo uniforme (1,00): Σ_faixa retorno_médio × lift de probabilidade × (1/rateio nas faixas 14/15).

## Algoritmo (`lotofacil-payout-v1`)

1. Núcleo (`fixedCount`) = fixadas + dezenas de melhor guia (`θ − 1,35·popularidade`).
2. Pool de 1.500 jogos únicos amostrados com o guia (seed reproduzível), respeitando excluídas e filtros.
3. Ordena por `evIndex`; seleção gulosa com sobreposição ≤ 12 (relaxa se inviável). EV é aditivo entre jogos; limitar a sobreposição só reduz a variância.

Auditoria em `generatorOptions.payout`: modelo, concurso limite, `evIndex`, `shareIndex` e `hitRate11` por jogo.

## Limites

- Ganho típico estimado ≈ +15% no retorno esperado de um jogo (de ≈39% para ≈45% da arrecadação). Continua negativo: não é estratégia de lucro.
- Metade do ganho vem da componente de 15 acertos (rara, alta variância) e da extrapolação do rateio; a parte de frequência é pequena e incerta.
- Reajuste: `node scripts/fitLotofacilModel.mjs [baseUrl]` imprime os parâmetros de `src/generator/lotofacilModel.ts`.
