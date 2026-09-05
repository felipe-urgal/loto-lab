# Strategy Lab — reporting — #62

## Objetivo

Separar a montagem de séries e variantes apresentáveis do motor de experimento/inferência do Strategy Lab, sem alterar benchmark, ranking, random controls, walk-forward ou schema público.

## Ownership

`src/lab/strategyLabReporting.ts` passa a ser o owner de:

- `StrategyLabPoint`;
- `StrategyLabVariant`;
- bucketização das rodadas em séries;
- projeção de `BacktestSummary` para os pontos da série;
- montagem final de uma variante com rules/analysis model opcionais.

`src/lab/strategyLab.ts` continua como owner de:

- seleção e execução dos experimentos `fixed-core`, `external-rules` e `score-model`;
- período e parâmetros do experimento;
- random controls e controle próximo da mediana;
- ranking por ROI/prize rate;
- evidência Monte Carlo e correção por múltiplas comparações;
- ranking quality e walk-forward;
- composição do `StrategyLabResult` schema v2.

Os tipos públicos `StrategyLabPoint` e `StrategyLabVariant` continuam reexportados por `strategyLab.ts` para não quebrar consumidores existentes.

## Não-regressão

A extração não move nem reinterpreta lógica estatística. `tests/strategyLab.test.ts` continua caracterizando schema v2, presets por loteria, random evidence, score models e ausência de leakage. `tests/strategyLabArchitecture.test.ts` fixa que inferência permanece no módulo principal e reporting no novo owner.

## Verificação

Gate completo: `npm run check`. Qualquer diferença no schema, winner, benchmark, número de rodadas, séries ou evidência deve bloquear a mudança.
