# Índice de documentos de tarefas

`docs/tasks/` preserva planos, decisões, contratos e registros de fatias específicas. O backlog vivo continua nas issues; prioridade e dependências atuais ficam em [`docs/ROADMAP.md`](../ROADMAP.md).

Este índice evita usar documentos históricos como backlog paralelo. **Status e “próximo foco” abaixo refletem as epics atuais; task docs concluídos permanecem como registro, não como trabalho pendente.**

## #60 — Frontend TypeScript, ownership e lifecycle

Registros relevantes:

- [`WEB_TYPED_BOUNDARY_CONTRACT.md`](WEB_TYPED_BOUNDARY_CONTRACT.md) — boundaries JavaScript migrados permanecem import-only;
- [`MAIN_CONTEXT_CONTRACT.md`](MAIN_CONTEXT_CONTRACT.md) — identidade/normalização compartilhada do contexto principal;
- [`APP_SHARED_PRIMITIVES.md`](APP_SHARED_PRIMITIVES.md) — primitives compartilhadas já consolidadas;
- [`AGENDA_MAIN_CONTEXT.md`](AGENDA_MAIN_CONTEXT.md) — Agenda reutiliza o contrato compartilhado de loteria; concluído em #234;
- [`JOBS_PRESENTATION_OWNER.md`](JOBS_PRESENTATION_OWNER.md) — apresentação de Execuções separada do lifecycle; concluído em #242.

Próximo foco: reduzir state/lifecycle imperativo e decompor módulos grandes restantes por responsabilidade real.

## #62 — Decomposição algorítmica

Registros relevantes:

- [`ADVANCED_ANALYSIS_DECOMPOSITION_PLAN.md`](ADVANCED_ANALYSIS_DECOMPOSITION_PLAN.md) — ordem segura de extração de `analysis/advanced.ts`;
- [`ADVANCED_CONTINUITY_CHARACTERIZATION.md`](ADVANCED_CONTINUITY_CHARACTERIZATION.md) — contratos de gaps, continuidade e left-censoring;
- [`ADVANCED_CONTINUITY_OWNER.md`](ADVANCED_CONTINUITY_OWNER.md) — owner de continuidade/qualidade extraído em #236;
- `src/analysis/statistics.ts` — owner de estatística/combinatória extraído em #243 com reexports públicos preservados;
- [`ADVANCED_STRUCTURE_CHARACTERIZATION.md`](ADVANCED_STRUCTURE_CHARACTERIZATION.md) — contrato estrutural das três loterias e regressão de gaps estabilizado em #249;
- [`ADVANCED_STRUCTURE_OWNER.md`](ADVANCED_STRUCTURE_OWNER.md) — owner de estrutura/filtros metodológicos em review via PR #250.

Próximo foco: revisar/integrar a PR #250 sem alterar metodologia ou expected values; depois reavaliar o hotspot restante antes de escolher outra seam.

## #63 — Observabilidade operacional

Registros relevantes:

- [`HTTP_METRICS.md`](HTTP_METRICS.md) — baseline HTTP process-local;
- [`ANALYSIS_JOB_OBSERVABILITY.md`](ANALYSIS_JOB_OBSERVABILITY.md) — saúde persistida da fila;
- [`POSTGRES_POOL_METRICS.md`](POSTGRES_POOL_METRICS.md) — pressão do pool PostgreSQL;
- [`CAIXA_REQUEST_METRICS.md`](CAIXA_REQUEST_METRICS.md) — requests/latência/erros/timeouts da CAIXA;
- [`OPENAI_REQUEST_METRICS.md`](OPENAI_REQUEST_METRICS.md) — requests/latência/erros/timeouts e uso conhecido da OpenAI; concluído em #235;
- [`OPERATIONS_INCIDENT_RUNBOOKS.md`](OPERATIONS_INCIDENT_RUNBOOKS.md) — runbooks operacionais derivados dos sinais existentes; concluído em #244.

Próximo foco: observar baseline real e definir poucos SLOs úteis antes de qualquer tuning de timeout/retry/backoff/pool/concorrência.

## #64 — Jornada e contexto pós-redesign

Registros relevantes:

- [`INFORMATION_ARCHITECTURE_JOURNEY.md`](INFORMATION_ARCHITECTURE_JOURNEY.md) — Protótipo A e jornada alvo;
- [`LAB_CONTEXTUAL_BACKTESTS.md`](LAB_CONTEXTUAL_BACKTESTS.md) — Laboratório → Testes históricos;
- [`ANALYSIS_CONTEXT_ACTIONS.md`](ANALYSIS_CONTEXT_ACTIONS.md) — Análises → Laboratório/Gerador;
- [`JOBS_CONTEXT_LINKS.md`](JOBS_CONTEXT_LINKS.md) — Execuções → owners de origem e retorno de backtest concluído por `jobId`, reconciliado em #237/#239.

Próximo foco: avaliar retorno contextual do Laboratório e proveniência/IA somente quando existir identidade persistida suficiente, sem estado duplicado.

## #65 — Produção e performance baseada em evidência

Registros relevantes:

- [`PRODUCTION_RESOURCE_BASELINE_PROTOCOL.md`](PRODUCTION_RESOURCE_BASELINE_PROTOCOL.md) — protocolo reproduzível para transformar `prod:resources` em evidência comparável; concluído em #245.

Próximo foco: coletar séries reais sob workloads comparáveis. Limites, índices, concorrência e timeouts continuam dependendo de baseline antes/depois.

## #66 — Proveniência científica

Registros relevantes:

- [`RESEARCH_PROVENANCE_CONTRACT.md`](RESEARCH_PROVENANCE_CONTRACT.md) — identidade mínima e guardrails de proveniência/decisão;
- [`RESEARCH_HYPOTHESIS_ROOT.md`](RESEARCH_HYPOTHESIS_ROOT.md) — raiz persistida em #231 e primeira evidência canônica (`backtest_run`) em #238;
- [`RESEARCH_HYPOTHESIS_DECISION.md`](RESEARCH_HYPOTHESIS_DECISION.md) — decisão humana/auditável com evidência obrigatória e concorrência protegida; concluído em #246.

Próximo foco: conectar eventual aplicação/resultado real usando IDs canônicos já existentes, sem owner genérico de experimento/evidência.

## Histórico concluído fora das epics acima

Os demais arquivos deste diretório continuam válidos como registros de decisões/fatias já entregues. Eles **não** representam backlog ativo apenas por permanecerem versionados.

## Regra de manutenção

Ao concluir uma fatia:

1. atualizar a issue da epic com o que entrou e o próximo passo;
2. atualizar `docs/ROADMAP.md` somente quando prioridade/dependência/estado estrutural mudar;
3. criar ou atualizar task doc apenas quando houver contrato/decisão que mereça histórico próprio;
4. substituir status pré-merge (`em branch`, `pronto para merge`) pelo PR efetivamente entregue;
5. não duplicar critérios de aceite em README, roadmap, issue e task doc sem necessidade;
6. documentos concluídos podem permanecer como histórico, mas não devem ser interpretados como backlog ativo.
