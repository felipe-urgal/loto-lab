# Runbooks de incidentes operacionais

Issue: #63

Status: fatia implementada em branch para validação.

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

## Validação esperada

Mudança documental: `npm run check` continua sendo o gate canônico do PR. O auto-review final deve conferir que os runbooks não inventam sinais, comandos destrutivos ou parâmetros que não existam no sistema atual.

## Próximo passo

Depois de observar baseline real, a #63 pode definir poucos SLOs para HTTP, sync e jobs. Ajustes de resiliência/tuning continuam dependentes dessa evidência.