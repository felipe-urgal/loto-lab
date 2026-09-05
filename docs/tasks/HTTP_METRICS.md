# Métricas HTTP — #63

## Objetivo

Adicionar a primeira fatia operacional de métricas orientadas a SLO sem introduzir labels de alta cardinalidade nem uma dependência externa de observabilidade antes de existir necessidade medida.

## Coleta

`src/observability/httpMetrics.ts` mantém contadores por **família fixa de rota**:

- health;
- metrics;
- analysis;
- generation;
- games;
- strategies;
- operations;
- agenda;
- ai;
- contests;
- api.other;
- web;
- other.

Cada bucket registra:

- requests;
- respostas 4xx;
- respostas 5xx;
- taxa 4xx/5xx;
- latência p50/p95/p99.

Amostras de latência são rolling e limitadas às últimas 512 observações por família. IDs de request, parâmetros dinâmicos, payloads, prompts, jogos e demais dados sensíveis não viram labels.

## Endpoint operacional

```text
GET /api/v1/ops/metrics
```

O endpoint vive no composition root de `createLotoLabServer` **depois** do guard de autenticação da aplicação. O snapshot descreve apenas o processo Node atual; reiniciar o processo zera os buckets.

Esse contrato é intencional para a topologia single-instance atual. Persistência/Prometheus/OpenTelemetry só devem ser introduzidos quando houver requisito operacional real que justifique custo e cardinalidade adicionais.

## Limitações e próximos passos

Esta fatia não declara SLOs finais e não cobre ainda duração/falha de jobs, sync, CAIXA, OpenAI ou PostgreSQL. Esses sinais devem reutilizar `operation_runs`, estados de job e telemetria já existente quando forem implementados.

## Verificação

- `tests/httpMetrics.test.ts` cobre classificação fixa, error rates, percentis e limite do sample;
- `tests/httpMetricsArchitecture.test.ts` garante que o endpoint permaneça atrás da autenticação e que a instrumentação aconteça no composition root;
- gate completo: `npm run check`.
