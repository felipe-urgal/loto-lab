# Espaço matemático do plano de geração — #62

## Objetivo

Separar do orchestrator `src/generator/planning.ts` os cálculos puros de baseline, combinações elegíveis e capacidade dos espaços algorítmicos, preservando integralmente a metodologia pública do gerador.

## Ownership

`src/generator/planningSpace.ts` passa a ser o owner de:

- `GenerationRange`, `GenerationConstraints`, `GenerationBaseline` e `GenerationAlgorithmSpace`;
- `combinationCount`;
- baseline condicional após fixas/excluídas;
- contagem exata por programação dinâmica para filtros de paridade, repetição e soma;
- limites/capacidade dos espaços por quantidade de dezenas fixas.

`src/generator/planning.ts` continua responsável por:

- escopo temporal/anti-leakage do histórico;
- validação de seleção manual;
- metodologia por loteria;
- tiers usados pelo plano;
- data quality e gaps;
- composição final do `GenerationPlan` e auditoria de lote.

Os exports públicos anteriores continuam disponíveis por `planning.ts`, incluindo `combinationCount` e os tipos de constraints/baseline/space.

## Não-regressão

Nenhum parâmetro, shortlist, score, regra por loteria, cobertura ou fórmula foi alterado. Os testes existentes em `generationPlanning.test.ts` continuam sendo caracterização do universo oficial, filtro exato de paridade, seleção manual, repetição e auditoria de lote. `generationPlanningArchitecture.test.ts` fixa o novo ownership.

## Verificação

Gate completo: `npm run check`. Qualquer diferença nos números oficiais ou coberturas esperadas deve bloquear a extração em vez de ser normalizada como “mudança de refactor”.
