# Runbooks de incidentes operacionais

Issue: #63

Status: concluída na `main` via #244 em 2026-09-06.

## Objetivo

Transformar os sinais operacionais já disponíveis em uma sequência curta de diagnóstico e contenção para incidentes recorrentes, sem escolher SLOs ou alterar tuning antes de baseline observada.

## Cobertura

`docs/OPERATIONS_RUNBOOKS.md` cobre:

- CAIXA indisponível/lenta;
- Analysis Jobs sem progresso;
- sync `partial`, `failed` ou stale;
- pressão/indisponibilidade PostgreSQL;
- OpenAI indisponível/lenta.

## Guardrails

- métricas continuam process-local/persistidas conforme o owner atual;
- não existe threshold novo nesta fatia;
- timeout, retry, backoff, pool, índices e concorrência permanecem inalterados;
- IA continua interpretativa: falha do provider não muda o cálculo determinístico;
- ausência de dado financeiro não é convertida para zero;
- runbook orienta recuperação e coleta de evidência, não tuning automático.

## Validação

`npm run check` passou no CI do SHA final de #244. O auto-review final confirmou que os runbooks não inventam sinais, comandos destrutivos ou parâmetros inexistentes; `docs/OPERATIONS.md` referencia o runbook canônico.

## Próximo passo

Depois de observar baseline real, a #63 pode definir poucos SLOs para HTTP, sync e jobs. Ajustes de resiliência/tuning continuam dependentes dessa evidência.
