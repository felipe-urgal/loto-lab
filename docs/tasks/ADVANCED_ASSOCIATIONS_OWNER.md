# Owner de associações da análise avançada

Issue: #62

Branch: `refactor/62-analysis-associations-owner`

Status: em execução após a characterization entregue em #251.

## Objetivo

Extrair de `src/analysis/advanced.ts` a responsabilidade coesa de associações exploratórias de pares/trincas, sem alterar cálculo, inferência ou schema público.

## Ownership

- `src/analysis/associations.ts` passa a possuir contagem de pares/trincas, probabilidades esperadas, estatística de associação, teste binomial bilateral exato, correção de Bonferroni e highlights;
- `src/analysis/statistics.ts` continua owner dos helpers matemáticos compartilhados;
- `src/analysis/frequency.ts` continua owner do universo válido da loteria via `numberRange`;
- `src/analysis/advanced.ts` permanece composition root e apenas delega `combinations` ao novo owner.

## Contratos preservados

A characterization de #251 deve permanecer inalterada para Mega-Sena, Lotofácil e Dia de Sorte:

- total de pares e total de comparações de trincas;
- `observed`, `expected`, `lift`, `zScore`, `pValue`, `adjustedPValue` e `evidence`;
- teste `exact-binomial-two-sided`;
- correção `bonferroni`;
- ordenação dos highlights positivos/negativos;
- semântica explícita de associação exploratória, sem promessa preditiva.

## Fora de escopo

- dinâmica/ranking e robustez;
- ciclos;
- similaridade;
- rolling validation/anti-leakage;
- qualquer mudança de threshold, evidence level, teste estatístico ou correção;
- alteração de expected values da characterization.

## Validação

Além de `tests/advancedAssociationsCharacterization.test.ts`, esta fatia adiciona um guard de ownership para impedir que a implementação retorne silenciosamente a `advanced.ts` ou ganhe dependências de continuidade/scoring/estrutura.

O gate canônico permanece `npm run check`. A PR só fica pronta após CI verde no SHA final, pré-review do diff e auto code review final conforme `AGENTS.md`.
