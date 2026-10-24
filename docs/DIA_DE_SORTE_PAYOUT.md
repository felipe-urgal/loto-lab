# Dia de Sorte — gerador "Prêmio máximo" (anti-rateio)

Mesmo propósito `payout` das outras modalidades, modelo `dia-de-sorte-ev-v1`. Restrito a jogos de 7 dezenas.

## Achados (1.330 concursos, 2018–2026)

- Sorteio compatível com uniforme: χ² 31,2/30 gl, correlação 0,29 entre metades e encolhimento por CV ≈ 0; paridade, repetição e soma sem desvio; "quente/frio" sem sinal. Mês da Sorte uniforme (χ² 9,0/11 gl). **Não há tilt de frequência.**
- Prêmios: 5 acertos, 4 acertos e Mês da Sorte são **fixos** (R$ 25, 5 e 2,50 no preço atual); só 7 e 6 acertos são rateados (13,5% e 6,1% da arrecadação; fixos somam 15,7%).
- Popularidade: R² fora da amostra 0,48 / 0,33 / 0,15 para 4/5/6 acertos; correlação 0,76–0,82 entre metades. As 31 dezenas são todas "datas", então a amplitude é pequena (±0,09): menos apostadas 1, 21, 20, 31, 26; mais apostadas 7, 13, 3, 17.
- Inclinações OOS por faixa sobre o escore (4→0,88; 5→1,26; 6→1,86 [1,43–2,25]; 7→3,37 [1,57–5,20]) são maiores que a teoria; o modelo usa a teoria × 1,26 como limite conservador (6→1,63; 7→1,99).

## Modelo

- Faixa 6: o divisor é o total de ganhadores da faixa; dado que o jogo acerta 6 das 7 dezenas, o escore entra com peso `6/7 − 1/24`.
- Faixa 7: o divisor são os outros detentores do mesmo jogo, `E[1/(1+K)]`, K ~ Poisson(μ0·índice).
- `evIndex` = Σ_faixa retorno_médio × fator de rateio (fixas = 1), normalizado para média 1,00 sobre jogos uniformes (verificado em teste).

## Algoritmo (`dia-de-sorte-payout-v1`)

1. Núcleo (`fixedCount`) = fixadas + dezenas pouco apostadas amostradas.
2. Pool de 8.000 jogos únicos amostrados com peso `exp(-10·popularidade)` (seed reproduzível), respeitando excluídas e filtros.
3. Ordena por `evIndex`; seleção gulosa com sobreposição ≤ 3 (relaxa se inviável).
4. Mês da Sorte: meses distintos entre os jogos (sorteio uniforme com a seed); o mês não altera o valor esperado, só reduz variância.

Auditoria em `generatorOptions.payout`: modelo, concurso limite, `evIndex` e índice de ganhadores do jogo exato por jogo, sobreposição máxima.

## Limites

- Ganho típico ≈ +11% por jogo (melhor jogo ≈ +17%): o menor das quatro modalidades, porque a maior parte do retorno vem de prêmios fixos. O retorno total continua muito abaixo de 100% (≈ 36% da arrecadação).
- A faixa de 7 acertos é rara e de alta variância; o IC dos coeficientes de 6 e 7 é largo.
- Reajuste: `node scripts/fitDiaDeSorteModel.mjs [baseUrl]`.
