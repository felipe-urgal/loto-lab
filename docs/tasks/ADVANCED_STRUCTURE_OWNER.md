# Owner de estrutura da análise avançada

Issue: #62

Status: fatia concluída via PR #250.

## Objetivo

Executar a terceira extração prevista no plano de decomposição de `src/analysis/advanced.ts`, depois da estabilização dos owners de continuidade e estatística e da characterization de estrutura consolidada em #249.

A fatia move somente estrutura dos concursos e cobertura dos filtros metodológicos para `src/analysis/structure.ts`. Não há alteração de metodologia, schema público ou valores esperados.

## Owner

O novo módulo concentra:

- `longestConsecutiveRun`;
- `lotofacilGrid`;
- `structureForContest`;
- `structuralMetric`;
- `methodologyRanges`;
- `exactFilterCoverage`;
- `buildStructure`.

`buildStructure` é o entrypoint usado pela composição de `buildAdvancedAnalysis`. `structureForContest` também é exportado pelo módulo interno porque a similaridade estrutural usa a mesma representação; manter esse consumo no owner evita duplicação da regra estrutural.

## Dependências

O sentido das dependências permanece acíclico:

- `structure.ts` usa `continuity.ts` para validar predecessor consecutivo;
- `structure.ts` usa `frequency.ts` para o universo configurado;
- `structure.ts` usa `statistics.ts` para combinatória e distribuições;
- `advanced.ts` consome `structure.ts` na composição e na similaridade;
- nenhum desses módulos depende de volta de `advanced.ts`.

## Contratos preservados

A characterization de `ADVANCED_STRUCTURE_CHARACTERIZATION.md` continua sendo a fonte de verdade. A extração preserva:

- paridade, soma, repetição, baixo/alto e maior sequência consecutiva;
- repetição `null` quando não existe predecessor imediatamente consecutivo;
- exclusão de transições com gaps da cobertura histórica;
- grid 5x5, linhas, colunas e moldura específicos da Lotofácil;
- baselines matemáticas uniformes sem reposição;
- ranges metodológicos específicos de Mega-Sena, Lotofácil e Dia de Sorte;
- universo combinatório exato e cobertura histórica existentes;
- texto explicativo e shape público de `structure` sem alterações;
- nenhuma alteração em score, pesos, p-values, rolling validation ou associações.

## Validação

A rede principal continua em `tests/advancedStructureCharacterization.test.ts`, cobrindo as três loterias e regressão de gap. `tests/advancedStructureOwnership.test.ts` adiciona o guard arquitetural para garantir que os helpers estruturais não retornem ao hotspot e que o novo owner não absorva ranking, validação ou associações.

Nenhum expected value da characterization foi atualizado para fazer a extração passar. O SHA final foi validado com `npm run check`, incluindo build/declaration emit e a suíte completa de testes.

## Próximo passo

Com esta fatia concluída, a #62 deve reavaliar o hotspot restante a partir do novo tamanho e das dependências reais antes de escolher outra seam. Qualquer próxima extração precisa ser uma fatia independente; mudança metodológica continua fora deste refactor.
