# Geradores "Prêmio máximo" (`purpose: "payout"`)

Contrato comum dos geradores que maximizam o **retorno esperado** de um jogo, sem alterar a probabilidade de acerto de forma relevante (os sorteios são tratados como uniformes, salvo viés comprovado fora da amostra).

## Método

1. Teste de uniformidade do histórico (χ² por dezena, estabilidade entre metades, encolhimento por validação cruzada em 10 blocos, repetição, soma, paridade, quente/frio walk-forward). Só entra viés de frequência se for persistente e se mantiver fora da amostra (hoje, somente Lotofácil).
2. Popularidade das dezenas: ridge de `log(ganhadores_da_faixa / arrecadação)` nas dezenas sorteadas, com efeito fixo por ano. O sorteio é exógeno, então o coeficiente mede o comportamento dos apostadores. Valida-se com R² par/ímpar, correlação entre metades do histórico e coeficientes por faixa em tercis fora da amostra contra a teoria.
3. Retorno esperado: Σ_faixa retorno_médio × fator de rateio. Faixa com divisor "total de ganhadores": `exp(-coef·m_k·S)`, com `m_k = k/n − (n−k)/(U−n)`. Faixa do jogo exato: `E[1/(1+K)]`, K ~ Poisson. Faixas de prêmio fixo não mudam. O índice é normalizado para média 1,00 sobre jogos uniformes (coberto por teste).
4. Geração: pool amostrado com seed, ordenado por `evIndex`, seleção gulosa com sobreposição limitada. Relatório em `generatorOptions.payout`.

Cada modalidade tem modelo versionado em `src/generator/<modalidade>Model.ts`, gerador em `<modalidade>Payout.ts`, script de reajuste `scripts/fit<Modalidade>Model.mjs` e documento próprio.

| Modalidade | Modelo | Documento | Ganho típico estimado |
| --- | --- | --- | --- |
| Mega-Sena | `mega-popularity-v1` | `MEGA_SENA_PAYOUT.md` | índice de rateio ≈ 0,3 (≈ 3× menos co-ganhadores na sena) |
| Lotofácil | `lotofacil-ev-v1` | `LOTOFACIL_PAYOUT.md` | ≈ +15% |
| Quina | `quina-ev-v1` | `QUINA_PAYOUT.md` | ≈ +30% |
| Dia de Sorte | `dia-de-sorte-ev-v1` | `DIA_DE_SORTE_PAYOUT.md` | ≈ +11% |
| Dupla Sena | `dupla-sena-ev-v1` | `DUPLA_SENA_PAYOUT.md` | ≈ +17% a +27% |
| +Milionária | `mais-milionaria-ev-v1` | `MAIS_MILIONARIA_PAYOUT.md` | ≈ +12% a +16% |
| Timemania | `timemania-ev-v1` | `TIMEMANIA_PAYOUT.md` | ≈ +12% a +15% |

O retorno total de qualquer loteria continua muito abaixo de 100% da arrecadação: não é estratégia de lucro.

## Modalidades sem gerador `payout`

- **Lotomania** (2.991 concursos): sorteio uniforme (χ² 101,4/99 gl, estabilidade nula) e popularidade por dezena sem poder preditivo (R² fora da amostra ≤ 0,03; correlação entre metades ≤ 0,44 só na faixa de 15 acertos). Um modelo estrutural (linhas, colunas, bordas) explica no máximo 5–9% da variância dos ganhadores de 15 acertos e ~0 nas faixas altas. Mesmo com pesos sobreajustados, o melhor jogo de 50 dezenas teria no máximo 7–14% menos co-ganhadores. Não há vantagem real a oferecer; o propósito `payout` não é aceito para `lotomania`. Para variância, `portfolio` já minimiza sobreposição entre jogos.
