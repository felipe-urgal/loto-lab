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

- **Lotomania** (2.991 concursos): sorteio uniforme (χ² 101,4/99 gl, estabilidade nula) e popularidade por dezena quase sem poder preditivo (R² fora da amostra 0,02; correlação 0,44 entre metades). A validação por tercis mostra coeficientes positivos nas faixas de 16–18 acertos, mas o escore varia pouco entre sorteios (Δ ≈ 0,08), ou seja ≤ ~12% entre os extremos de *sorteios*; para um jogo de 50 dezenas o melhor efeito possível é de 7–14% menos co-ganhadores, com pesos que não se sustentam fora da amostra. Um modelo estrutural (linhas, colunas, bordas) explica no máximo 5–9% da variância dos ganhadores de 15 acertos. Não há vantagem real a oferecer; o propósito `payout` não é aceito para `lotomania`. Para variância, `portfolio` já minimiza sobreposição entre jogos.

## Núcleo fixo e persistência

O domínio e a migração `018` só aceitam certos tamanhos de núcleo fixo por modalidade (Mega-Sena e Dia de Sorte: 0, 2 ou 3; Lotofácil: 8, 9 ou 10; demais: 0). O `payout` segue o mesmo conjunto do modo Experimental (a API rejeita outros valores com 400 e a interface oferece só as opções válidas). Nos geradores usados diretamente, um núcleo de tamanho não persistível continua valendo em todos os jogos, mas é classificado como variável (`payoutPartition.ts`). O teste `payoutApi.test.ts` exercita prévia e salvamento no PostgreSQL das sete modalidades.

## Validação e manutenção

- `node scripts/validatePayoutModels.mjs [baseUrl] [modalidade|all]` (após `npm run build:server`) reproduz a evidência: uniformidade e estabilidade da frequência, R² fora da amostra e correlação entre metades da popularidade, coeficientes por faixa em tercis fora da amostra (bootstrap IC95%) e a comparação com os coeficientes versionados. Sai com código 1 se algum coeficiente do modelo cair fora do IC95% (`OUT`). Faixas sem ganhadores suficientes aparecem como `NOT-VALIDATABLE` (na Mega-Sena, a sena é comparada com o coeficiente implícito pela faixa de 5 acertos).
- A prévia anota `generatorOptions.payout.modelAge` (`ageContests`, `refreshAfterContests`, `stale`). Passado cerca de um ano de concursos desde `fitThroughContest`, a interface mostra o aviso de reajuste. Reajuste = rodar o `scripts/fit*Model.mjs` da modalidade, atualizar o modelo, rodar a validação e os testes.
- A interface exibe o bloco "Retorno esperado estimado" (retorno médio do lote e por jogo; na Mega-Sena, o fator de co-ganhadores na sena), sempre com a ressalva de que é estimativa.
