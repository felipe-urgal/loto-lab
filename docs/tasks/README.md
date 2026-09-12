# Índice de documentos de tarefas

`docs/tasks/` existe apenas para referências arquiteturais que continuam úteis depois do merge. Histórico de implementação concluída pertence às issues, PRs, commits e testes; não deve permanecer como documentação paralela ao contrato atual.

Estado atual e política para novos ciclos ficam em [`docs/ROADMAP.md`](../ROADMAP.md).

## Referência durável atual

- [`ADVANCED_ANALYSIS_DECOMPOSITION_PLAN.md`](ADVANCED_ANALYSIS_DECOMPOSITION_PLAN.md) — arquitetura final dos owners de `src/analysis/advanced.ts`, invariants matemáticos/anti-leakage e decisão explícita de manter similaridade no composition root enquanto não existir boundary independente.

## Onde ficam os contratos atuais

- frontend e lifecycle: [`../WEB.md`](../WEB.md);
- análise e metodologia: [`../ANALYSES.md`](../ANALYSES.md) e [`../METHODOLOGY.md`](../METHODOLOGY.md);
- observabilidade e operação: [`../OPERATIONS.md`](../OPERATIONS.md) e [`../OPERATIONS_RUNBOOKS.md`](../OPERATIONS_RUNBOOKS.md);
- performance baseada em evidência: [`../PERFORMANCE.md`](../PERFORMANCE.md) e [`../PRODUCTION_RESOURCE_BASELINE.md`](../PRODUCTION_RESOURCE_BASELINE.md);
- jornada/proveniência/apostas reais: [`../WEB.md`](../WEB.md), [`../REAL_BETS.md`](../REAL_BETS.md), [`../MY_GAMES.md`](../MY_GAMES.md), [`../API.md`](../API.md) e [`../DATABASE.md`](../DATABASE.md).

Os antigos task docs de fatias já concluídas foram removidos porque repetiam contratos absorvidos por essas fontes de verdade.

## Regra de manutenção

Crie um novo task doc somente quando ele continuar útil depois do merge como contrato arquitetural durável que não tenha owner melhor em um documento canônico existente.

Para registrar apenas "o que foi feito", use issue, PR, commit e testes.
