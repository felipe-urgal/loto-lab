# Métricas do pool PostgreSQL

Issue: #63

Status: concluída nesta fatia.

## Objetivo

Adicionar ao endpoint operacional existente um sinal mínimo de pressão do pool PostgreSQL antes de qualquer tuning de conexões, timeout, índices ou concorrência.

## Contrato

`src/observability/postgresPoolMetrics.ts` deriva somente quatro contagens do `pg.Pool` já composto pela aplicação:

- `totalConnections`;
- `idleConnections`;
- `activeConnections`;
- `waitingRequests`.

O snapshot é de cardinalidade fixa. Não inclui SQL, nome de query, loteria, request ID, usuário, payload ou outro identificador dinâmico.

`activeConnections` é derivado de total menos idle. Valores impossíveis/negativos são normalizados no boundary de observabilidade para que o endpoint não publique contagens inválidas.

## Exposição

`GET /api/v1/ops/metrics` continua atrás da autenticação da aplicação e passa a incluir o campo `postgres` ao lado das métricas HTTP e do snapshot de Analysis Jobs.

A coleta é process-local e instantânea; não cria persistência paralela nem altera o pool.

## Fora de escopo

Esta fatia não define:

- SLO de banco;
- threshold de saturação;
- novo `max` de conexões;
- novos timeouts;
- índices;
- tracing;
- tuning de workers.

Essas decisões exigem baseline e profiling reais.

## Validação

- `tests/postgresPoolMetrics.test.ts`: derivação e normalização das contagens;
- `tests/postgresPoolMetricsArchitecture.test.ts`: composição no endpoint autenticado e ausência de dimensões dinâmicas;
- gate canônico do PR: `npm run check` via CI.
