# Timemania — gerador "Prêmio máximo" (anti-rateio)

Mesmo propósito `payout` das outras modalidades, modelo `timemania-ev-v1`. Restrito a jogos de 10 dezenas; o **Time do Coração é obrigatório** e escolhido pelo apostador (a geração falha sem ele).

## Achados (2.457 concursos, 2008–2026; 2.402 com premiação completa)

- Sorteio compatível com uniforme: χ² 78,8/79 gl, correlação −0,03 entre metades, encolhimento por CV −0,07; repetição e soma sem desvio; "quente/frio" sem sinal (0,85 vs 0,875 ± 0,019). **Não há tilt de frequência.**
- Prêmios: 3 e 4 acertos e Time do Coração são **fixos** (≈ 7,5% da arrecadação). Rateados: 5, 6 e 7 acertos (≈ 29,4%, quase todo o jackpot acumulado de 7 acertos).
- Popularidade das dezenas (log dos ganhadores de 4 acertos por arrecadação): R² fora da amostra 0,66 / 0,59 / 0,34 para 3/4/5 acertos; correlação 0,89–0,95 entre as metades do histórico. Menos apostadas: 70, 61, 40, 30, 41; mais apostadas: 13, 19, 10, 5, 7.
- Coeficientes OOS por faixa 3/4/5/6: 0,83 / 1,15 / 1,49 / 1,55 [1,03–2,00]. O de 7 acertos é extrapolado (1,8).

## Modelo

- Faixas 5–6: o divisor é o total de ganhadores da faixa; dado que o jogo de 10 dezenas acerta k, entra `k/10 − (7−k)/70` do seu escore.
- Faixa 7: o divisor são os outros detentores do mesmo jogo, `E[1/(1+K)]` com K ~ Poisson(μ0·índice), μ0 ≈ 0,03.
- Faixas fixas e Time do Coração: fator 1. `evIndex` normalizado para média 1,00 sobre jogos uniformes de 10 dezenas (verificado em teste).

## Algoritmo (`timemania-payout-v1`)

1. Núcleo (`fixedCount`) = fixadas + dezenas pouco apostadas amostradas.
2. Pool de 10.000 jogos únicos amostrados com peso `exp(-8·popularidade)` (seed reproduzível), respeitando excluídas e filtros.
3. Ordena por `evIndex`; seleção gulosa com sobreposição ≤ 3 (relaxa se inviável).
4. O Time do Coração informado é replicado em todos os jogos.

Auditoria em `generatorOptions.payout`: modelo, concurso limite, `evIndex` e índice de ganhadores da faixa de 7 acertos por jogo, sobreposição máxima.

## Limites

- Ganho típico ≈ +12% a +15% por jogo; o retorno total (≈ 37% da arrecadação) continua muito abaixo de 100%.
- O ganho concentra-se nas faixas de 5 e 6 acertos; o de 7 acertos é raro, de alta variância e extrapolado.
- Reajuste: `node scripts/fitTimemaniaModel.mjs [baseUrl]`.
