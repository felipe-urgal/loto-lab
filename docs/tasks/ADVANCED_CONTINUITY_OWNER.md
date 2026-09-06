# Owner de continuidade da análise avançada

Issue: #62

Status: fatia concluída via PR #236.

## Objetivo

Executar a primeira extração de código prevista no plano de decomposição de `src/analysis/advanced.ts`, depois dos characterization tests da #228.

A fatia move somente continuidade histórica e qualidade de dados para `src/analysis/continuity.ts`.

## Owner

O módulo passa a concentrar:

- `isConsecutive`;
- `splitContinuousSegments`;
- `latestContinuousSegment`;
- `buildDataQuality`.

Esses helpers continuam sendo usados por estrutura/repetição, dinâmica de atraso/ciclos, similaridade e rolling validation. O contrato observado não muda.

## Contratos preservados

- gaps continuam calculados pela diferença de numeração dos concursos já filtrados/ordenados;
- `missingContestCount` soma concursos ausentes, não quantidade de gaps;
- apenas os 20 gaps mais recentes são expostos em `dataQuality.gaps`;
- o trecho contínuo mais recente continua sendo a fonte da rolling validation;
- ausência de predecessor contínuo mantém repetição como `null`, nunca zero;
- concursos de outra loteria continuam filtrados antes da continuidade;
- nenhuma mudança em warmup, score, p-value, correção, ranges ou schema público.

## Validação

`tests/advancedContinuityCharacterization.test.ts` permanece a rede principal de characterization. Um guard adicional verifica que `advanced.ts` delega continuidade ao owner e que o novo módulo não absorve metodologia estatística.

## Próximo passo

Com esta fatia concluída, a #62 segue a ordem do plano para estatística/combinatória compartilhada. Mudança metodológica continua fora deste refactor.
