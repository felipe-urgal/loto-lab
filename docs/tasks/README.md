# Índice de documentos de tarefas

`docs/tasks/` mantém somente documentos que continuam úteis depois do merge como **contrato durável, protocolo ou guia operacional**. Histórico de implementação concluída pertence às issues, PRs, commits e testes; planos já executados devem ser removidos para não competir com a documentação canônica.

Estado atual e prioridades ficam em [`docs/ROADMAP.md`](../ROADMAP.md).

## Frontend e ownership

- [`WEB_TYPED_BOUNDARY_CONTRACT.md`](WEB_TYPED_BOUNDARY_CONTRACT.md) — boundaries JavaScript migrados permanecem finos/import-only;
- [`MAIN_CONTEXT_CONTRACT.md`](MAIN_CONTEXT_CONTRACT.md) — identidade e normalização compartilhadas do contexto principal;
- [`APP_SHARED_PRIMITIVES.md`](APP_SHARED_PRIMITIVES.md) — primitives compartilhadas com ownership explícito.

O epic estrutural #60 está concluído. Novos refactors devem nascer de hotspot concreto de estado, acoplamento, duplicação, segurança ou testabilidade.

## Análise avançada

- [`ADVANCED_ANALYSIS_DECOMPOSITION_PLAN.md`](ADVANCED_ANALYSIS_DECOMPOSITION_PLAN.md) — arquitetura final dos owners de `analysis/advanced.ts`, invariants e decisão de manter similaridade no compositor.

A decomposição da #62 está concluída; o arquivo permanece como referência arquitetural, não como backlog ativo.

## Observabilidade e operação

- [`HTTP_METRICS.md`](HTTP_METRICS.md);
- [`ANALYSIS_JOB_OBSERVABILITY.md`](ANALYSIS_JOB_OBSERVABILITY.md);
- [`POSTGRES_POOL_METRICS.md`](POSTGRES_POOL_METRICS.md);
- [`CAIXA_REQUEST_METRICS.md`](CAIXA_REQUEST_METRICS.md);
- [`OPENAI_REQUEST_METRICS.md`](OPENAI_REQUEST_METRICS.md);
- [`OPERATIONS_INCIDENT_RUNBOOKS.md`](OPERATIONS_INCIDENT_RUNBOOKS.md).

A #63 está concluída como baseline estrutural de observabilidade. Esses documentos permanecem porque descrevem sinais e operação atuais. SLO, timeout, retry/backoff ou alerta novo deve nascer de evidência observada e de uma tarefa específica, não como continuação indefinida do epic.

## Jornada e contexto

- [`ANALYSIS_CONTEXT_ACTIONS.md`](ANALYSIS_CONTEXT_ACTIONS.md) — ações contextuais de Análises;
- [`LAB_CONTEXTUAL_BACKTESTS.md`](LAB_CONTEXTUAL_BACKTESTS.md) — Laboratório → Testes históricos;
- [`JOBS_CONTEXT_LINKS.md`](JOBS_CONTEXT_LINKS.md) — Execuções → owners funcionais e retorno por identidade persistida.

A direção de jornada da #64 está concluída. O plano macro que antecedia a implementação foi removido; contratos específicos que ainda explicam deep links/ownership permanecem como referência.

## Performance baseada em evidência

- [`PRODUCTION_RESOURCE_BASELINE_PROTOCOL.md`](PRODUCTION_RESOURCE_BASELINE_PROTOCOL.md) — protocolo de baseline comparável antes de tuning.

A #65 está concluída como política e infraestrutura de medição. Otimização futura exige gargalo observado, comparação antes/depois e escopo próprio.

## Proveniência científica

O fluxo da #66 está consolidado nos documentos canônicos:

- [`../API.md`](../API.md) — endpoints de hipótese, evidência, decisão e aplicações reais;
- [`../DATABASE.md`](../DATABASE.md) — relações e migrations canônicas;
- [`../REAL_BETS.md`](../REAL_BETS.md) — aplicação/aposta real e resultado financeiro;
- [`../MY_GAMES.md`](../MY_GAMES.md) — uso da proveniência na jornada.

Os task docs intermediários de raiz/decisão/proveniência foram removidos após o contrato final ser absorvido por essas fontes de verdade.

## Regra de manutenção

Crie um novo task doc somente quando ele continuar útil depois do merge como contrato, protocolo ou guia. Para registrar apenas “o que foi feito”, use issue/PR/commit/testes.

Ao concluir uma fatia:

1. reconcilie a issue/epic;
2. atualize `docs/ROADMAP.md` quando estado/prioridade mudar;
3. atualize documentação técnica canônica quando o contrato do produto mudar;
4. remova planos temporários que deixaram de ter função após o merge.
