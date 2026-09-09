# Characterization de ciclos da análise avançada

Issue: #253

Epic: #62

Status: characterization + correção mínima da fronteira censurada à esquerda implementadas para validação.

## Objetivo

Congelar o contrato público de `advanced.dynamics.cycles` antes de decidir se ciclos merecem um owner próprio fora de `src/analysis/advanced.ts`.

A leitura do código e de `docs/ANALYSES.md` encontrou uma divergência relevante: a documentação já define que uma base iniciada depois do concurso `#1` não conhece a fronteira do ciclo que estava em andamento antes do primeiro registro observado. A implementação, porém, tratava o primeiro segmento como conhecido incondicionalmente.

Esta fatia corrige somente essa fronteira e adiciona regression/characterization tests. A extração de ownership continua separada.

## Contratos protegidos

`tests/advancedCyclesCharacterization.test.ts` usa `buildAdvancedAnalysis` como boundary público e fixa que:

- histórico contínuo iniciado no concurso `#1` pode registrar ciclos completos desde o começo conhecido;
- depois de um ciclo completo, o ciclo corrente expõe `currentLength`, `seen` e `missing` enquanto sua fronteira permanece conhecida;
- uma lacuna torna o ciclo corrente desconhecido até que o segmento posterior observe todas as dezenas pelo menos uma vez;
- o primeiro fechamento observado após uma lacuna apenas restabelece uma fronteira conhecida e não entra em `completedCount`/`historicalLength`;
- depois dessa recuperação, ciclos completos seguintes voltam a ser contabilizados normalmente;
- histórico iniciado em concurso `> 1` recebe a mesma proteção de left-censoring: antes do primeiro fechamento observado, o ciclo corrente é indisponível;
- o primeiro fechamento da base censurada apenas restabelece a fronteira; somente o ciclo completo seguinte entra no histórico de durações.

## Correção mínima

`buildCycles` mantém exatamente o mesmo algoritmo de segmentação e fechamento de ciclos. A única mudança de produção é considerar o primeiro segmento conhecido apenas quando o primeiro concurso armazenado é o `#1`.

Isso preserva:

- universo e regra de fechamento por loteria;
- `completedCount` e `historicalLength` para durações realmente observadas de ponta a ponta;
- semântica de `available/currentLength/seen/missing`;
- comportamento após gaps já existente;
- ausência de qualquer interpretação preditiva.

## Guardrails

- nenhuma mudança em ranking, weights, tiers, offsets, robustez ou frequência;
- nenhuma mudança em estrutura, associações, similaridade ou rolling validation;
- nenhum threshold, p-value, correction ou evidence level alterado;
- nenhum schema público novo;
- ciclos continuam descritivos e não viram sinal de probabilidade futura;
- a futura extração para um owner próprio deve preservar estes expected values sem ajuste.

## Próximo passo

Depois desta fatia verde, reavaliar se `buildCycles` forma seam coesa o suficiente para um owner próprio com dependências mínimas (`numberRange`, continuidade e sumarização).

Não agrupar dinâmica/ranking nessa extração apenas porque os blocos aparecem próximos em `advanced.ts`: dinâmica continua exigindo characterization específica de ranks, offsets, tiers e robustez antes de qualquer movimentação.
