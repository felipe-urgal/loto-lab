# Índice de documentos de tarefas

`docs/tasks/` mantém apenas documentos que ainda funcionam como **contrato, plano ativo ou guia operacional**. Histórico de implementação concluída pertence às issues, PRs, commits e testes; não deve ser duplicado indefinidamente em Markdown.

Prioridade e estado atual ficam em [`docs/ROADMAP.md`](../ROADMAP.md).

## #60 — Frontend TypeScript e ownership

- [`WEB_TYPED_BOUNDARY_CONTRACT.md`](WEB_TYPED_BOUNDARY_CONTRACT.md) — boundaries JavaScript migrados permanecem finos/import-only;
- [`MAIN_CONTEXT_CONTRACT.md`](MAIN_CONTEXT_CONTRACT.md) — identidade e normalização compartilhadas do contexto principal;
- [`APP_SHARED_PRIMITIVES.md`](APP_SHARED_PRIMITIVES.md) — primitives compartilhadas com ownership explícito.

## #62 — Motores e análise avançada

- [`ADVANCED_ANALYSIS_DECOMPOSITION_PLAN.md`](ADVANCED_ANALYSIS_DECOMPOSITION_PLAN.md) — arquitetura final dos owners de `analysis/advanced.ts`, invariants e decisão de manter similaridade no compositor.

Characterizations e notas de owner já concluídas foram removidas deste diretório. O contrato executável permanece nos testes e no código; o histórico permanece nas issues/PRs da #62.

## #63 — Observabilidade operacional

- [`HTTP_METRICS.md`](HTTP_METRICS.md);
- [`ANALYSIS_JOB_OBSERVABILITY.md`](ANALYSIS_JOB_OBSERVABILITY.md);
- [`POSTGRES_POOL_METRICS.md`](POSTGRES_POOL_METRICS.md);
- [`CAIXA_REQUEST_METRICS.md`](CAIXA_REQUEST_METRICS.md);
- [`OPENAI_REQUEST_METRICS.md`](OPENAI_REQUEST_METRICS.md);
- [`OPERATIONS_INCIDENT_RUNBOOKS.md`](OPERATIONS_INCIDENT_RUNBOOKS.md).

Esses documentos permanecem porque ainda sustentam a coleta de baseline e a definição futura de poucos SLOs úteis.

## #64 — Jornada e contexto

- [`INFORMATION_ARCHITECTURE_JOURNEY.md`](INFORMATION_ARCHITECTURE_JOURNEY.md) — direção da jornada pós-redesign;
- [`ANALYSIS_CONTEXT_ACTIONS.md`](ANALYSIS_CONTEXT_ACTIONS.md) — ações contextuais de Análises;
- [`LAB_CONTEXTUAL_BACKTESTS.md`](LAB_CONTEXTUAL_BACKTESTS.md) — Laboratório → Testes históricos;
- [`JOBS_CONTEXT_LINKS.md`](JOBS_CONTEXT_LINKS.md) — Execuções → owners funcionais e retorno por identidade persistida.

## #65 — Produção e performance baseada em evidência

- [`PRODUCTION_RESOURCE_BASELINE_PROTOCOL.md`](PRODUCTION_RESOURCE_BASELINE_PROTOCOL.md) — protocolo de baseline comparável antes de tuning.

## #66 — Proveniência científica

- [`RESEARCH_PROVENANCE_CONTRACT.md`](RESEARCH_PROVENANCE_CONTRACT.md) — contrato de identidade/proveniência;
- [`RESEARCH_HYPOTHESIS_ROOT.md`](RESEARCH_HYPOTHESIS_ROOT.md) — raiz persistida e evidência canônica;
- [`RESEARCH_HYPOTHESIS_DECISION.md`](RESEARCH_HYPOTHESIS_DECISION.md) — decisão humana/auditável.

## Regra de manutenção

Crie um novo task doc somente quando ele continuar útil depois do merge como contrato, plano ativo ou guia operacional. Para registrar apenas “o que foi feito”, use issue/PR/commit/testes.

Ao concluir uma fatia:

1. reconcilie a issue/epic;
2. atualize `docs/ROADMAP.md` quando estado/prioridade mudar;
3. atualize documentação técnica canônica quando o contrato do produto mudar;
4. remova task docs temporários que deixaram de ter função após o merge.
