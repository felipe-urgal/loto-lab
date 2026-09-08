# Owner de associações da análise avançada

Issue: #62

Entregue em #252.

Status: concluído; `src/analysis/associations.ts` é o owner coeso de associações de pares/trincas.

## Objetivo

Extrair de `src/analysis/advanced.ts` a responsabilidade coesa de associações exploratórias de pares/trincas, sem alterar cálculo, inferência ou schema público.

## Ownership

- `src/analysis/associations.ts` possui contagem de pares/trincas, probabilidades esperadas, estatística de associação, teste binomial bilateral exato, correção de Bonferroni e highlights;
- `src/analysis/statistics.ts` continua owner dos helpers matemáticos compartilhados;
- `src/analysis/frequency.ts` continua owner do universo válido da loteria via `numberRange`;
- `src/analysis/advanced.ts` permanece composition root e apenas delega `combinations` ao owner de associações.

## Contratos preservados

A characterization de #251 permaneceu inalterada para Mega-Sena, Lotofácil e Dia de Sorte:

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

Além de `tests/advancedAssociationsCharacterization.test.ts`, #252 adicionou `tests/advancedAssociationsOwnership.test.ts` para impedir que a implementação retorne silenciosamente a `advanced.ts` ou ganhe dependências de continuidade/scoring/estrutura.

A entrega foi validada pelo gate canônico `npm run check` e por auto code review final no SHA verde do PR, sem threads ou findings bloqueantes.

## Próximo passo

Reavaliar ciclos/dinâmica antes de escolher outra seam. A próxima extração só deve existir se houver characterization suficiente e ganho real de ownership; a ordem do plano não é automática.