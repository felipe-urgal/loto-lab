# Índice de documentos de tarefas

`docs/tasks/` preserva planos, decisões, contratos e registros de fatias específicas. O backlog vivo continua nas issues; prioridade e dependências atuais ficam em [`docs/ROADMAP.md`](../ROADMAP.md).

Este índice evita usar documentos históricos como backlog paralelo.

## #60 — Frontend TypeScript, ownership e lifecycle

- [`WEB_TYPED_BOUNDARY_CONTRACT.md`](WEB_TYPED_BOUNDARY_CONTRACT.md) — boundaries JavaScript migrados permanecem import-only;
- [`MAIN_CONTEXT_CONTRACT.md`](MAIN_CONTEXT_CONTRACT.md) — identidade/normalização compartilhada do contexto principal;
- [`APP_SHARED_PRIMITIVES.md`](APP_SHARED_PRIMITIVES.md) — primitives compartilhadas já consolidadas.

Próximo foco: state/lifecycle imperativo e decomposição de módulos grandes restantes.

## #62 — Decomposição algorítmica

- [`ADVANCED_ANALYSIS_DECOMPOSITION_PLAN.md`](ADVANCED_ANALYSIS_DECOMPOSITION_PLAN.md) — ordem segura de extração de `analysis/advanced.ts`;
- [`ADVANCED_CONTINUITY_CHARACTERIZATION.md`](ADVANCED_CONTINUITY_CHARACTERIZATION.md) — contratos de gaps, continuidade e left-censoring que devem permanecer equivalentes.

Próximo foco: extrair primeiro continuidade/qualidade de dados sem mudança metodológica.

## #63 — Observabilidade operacional

- [`HTTP_METRICS.md`](HTTP_METRICS.md) — baseline HTTP process-local;
- [`ANALYSIS_JOB_OBSERVABILITY.md`](ANALYSIS_JOB_OBSERVABILITY.md) — saúde persistida da fila;
- [`POSTGRES_POOL_METRICS.md`](POSTGRES_POOL_METRICS.md) — pressão do pool PostgreSQL;
- [`CAIXA_REQUEST_METRICS.md`](CAIXA_REQUEST_METRICS.md) — requests/latência/erros/timeouts da CAIXA.

Próximo foco: OpenAI, baseline observada e poucos SLOs/runbooks derivados de sinais reais.

## #64 — Jornada e contexto pós-redesign

- [`INFORMATION_ARCHITECTURE_JOURNEY.md`](INFORMATION_ARCHITECTURE_JOURNEY.md) — Protótipo A e jornada alvo;
- [`LAB_CONTEXTUAL_BACKTESTS.md`](LAB_CONTEXTUAL_BACKTESTS.md) — Laboratório → Testes históricos;
- [`ANALYSIS_CONTEXT_ACTIONS.md`](ANALYSIS_CONTEXT_ACTIONS.md) — Análises → Laboratório/Gerador;
- [`JOBS_CONTEXT_LINKS.md`](JOBS_CONTEXT_LINKS.md) — Execuções → owners de origem.

Próximo foco: retorno por `jobId` e proveniência contextual sem duplicar estado/controllers.

## #66 — Proveniência científica

- [`RESEARCH_PROVENANCE_CONTRACT.md`](RESEARCH_PROVENANCE_CONTRACT.md) — identidade mínima e guardrails de proveniência/decisão;
- [`RESEARCH_HYPOTHESIS_ROOT.md`](RESEARCH_HYPOTHESIS_ROOT.md) — primeira raiz persistida de hipótese e API inicial.

Próximo foco: associar um único tipo de evidência existente por FK explícita antes de expor decisão.

## Regra de manutenção

Ao concluir uma fatia:

1. atualizar a issue da epic com o que entrou e o próximo passo;
2. atualizar `docs/ROADMAP.md` somente quando prioridade/dependência/estado estrutural mudar;
3. criar ou atualizar task doc apenas quando houver contrato/decisão que mereça histórico próprio;
4. não duplicar critérios de aceite em README, roadmap, issue e task doc sem necessidade;
5. documentos concluídos podem permanecer como histórico, mas não devem ser interpretados como backlog ativo.
