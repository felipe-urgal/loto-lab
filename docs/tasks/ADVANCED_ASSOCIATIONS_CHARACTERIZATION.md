# Characterization das associações da análise avançada

Issue: #62

Entregue em #251.

Status: concluída; a characterization está na `main` e protege a extração do owner de associações.

## Objetivo

Congelar o comportamento público do bloco de associações antes da próxima seam de decomposição de `src/analysis/advanced.ts`.

A reavaliação feita após #250 confirmou que associações de pares/trincas formam uma fronteira menor e mais coesa que dinâmica, ciclos ou rolling validation: dependem do universo da loteria e dos helpers estatísticos já extraídos em `src/analysis/statistics.ts`, sem tocar continuidade, score ou anti-leakage.

A extração futura só deve mover ownership. Ela não pode descobrir ou redefinir inferência durante o refactor.

## Contratos protegidos

A characterization usa `buildAdvancedAnalysis` como boundary público e cobre Mega-Sena, Lotofácil e Dia de Sorte com fixtures determinísticas.

Ela congela:

- quantidade total de pares expostos por loteria;
- número de comparações de pares e trincas usado na correção;
- teste binomial bilateral exato;
- correção de Bonferroni;
- `observed`, `expected`, `lift`, `zScore`, `pValue`, `adjustedPValue` e `evidence` para highlights representativos;
- ordenação dos principais pares positivos/negativos e trincas positivas;
- manutenção da semântica explícita de que associações são exploratórias.

## Guardrails

- nenhum helper saiu de `advanced.ts` nesta fatia;
- nenhuma mudança em score, ranking, weights, estrutura, ciclos, similaridade ou rolling validation;
- nenhuma mudança de teste estatístico, correção, threshold ou evidence level;
- nenhum expected value foi ajustado para facilitar a futura extração;
- diferenças entre loterias continuam refletidas pelos seus universos e tamanhos de sorteio reais;
- o teste protege o resultado público, não funções internas que serão movidas.

## Critério para a próxima branch

O owner de associações só deve ser extraído se esta characterization e a suíte existente permanecerem verdes sem mudança nos valores esperados.

A extração deve permanecer acíclica e limitada a chaves de pares/trincas, cálculo do `AssociationStat` e `buildAssociations`. Se exigir alterar metodologia, `buildDynamics`, ciclos, rolling validation ou outros blocos não relacionados, a seam deve ser reavaliada em vez de ampliar o PR.
