# Métricas de requisição da CAIXA

Issue: #63

Status: fatia concluída.

## Objetivo

Observar a dependência externa da CAIXA antes de alterar timeout, retry, backoff ou SLO.

## Contrato

`src/observability/caixaMetrics.ts` mantém um snapshot process-local de cardinalidade fixa com:

- requests totais;
- sucessos;
- erros não-timeout;
- timeouts;
- taxas de erro e timeout;
- amostra limitada de latência com p50/p95/p99.

A instrumentação acontece dentro de `CaixaContestSource.fetchPayload`, que é o boundary real da chamada HTTP oficial. Uma requisição é registrada uma vez, como `success`, `error` ou `timeout`.

## Privacidade/cardinalidade

O snapshot não carrega:

- loteria;
- número de concurso;
- URL livre;
- payload;
- request ID;
- credencial;
- prompt ou conteúdo de usuário.

O endpoint autenticado `GET /api/v1/ops/metrics` expõe o snapshot em `caixa` ao lado de HTTP, Analysis Jobs e PostgreSQL.

## Fora de escopo

Esta fatia não muda:

- timeout de 12 segundos;
- política de retry do sync/bootstrap;
- backoff/jitter;
- concorrência;
- SLO/alerta.

Essas decisões devem usar a baseline observada, não preferência antecipada.
