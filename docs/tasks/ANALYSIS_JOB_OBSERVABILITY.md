# Observabilidade de Analysis Jobs

Issue: #63

Status: entregue via PR #212 (`6f2fb32`); a #63 permanece aberta para sinais operacionais e SLOs adicionais baseados em evidência.

## Objetivo da fatia

Medir a saúde operacional da fila de análises usando o PostgreSQL como fonte de verdade, sem introduzir labels de alta cardinalidade e sem misturar o snapshot persistido com a baseline HTTP process-local.

## Endpoint

`GET /api/v1/ops/metrics` permanece autenticado e continua expondo o snapshot HTTP existente. A resposta passa a acrescentar:

```json
{
  "analysisJobs": {
    "counts": {
      "queued": 0,
      "running": 0,
      "completed": 0,
      "failed": 0,
      "cancelled": 0
    },
    "oldestQueuedAgeSeconds": null
  }
}
```

O bloco HTTP existente não muda de significado: ele continua tendo escopo do processo atual. `analysisJobs`, por outro lado, é derivado da tabela `analysis_jobs` e sobrevive a restart da aplicação.

## Cardinalidade

As dimensões são deliberadamente fixas. Esta fatia **não** expõe como labels/dimensões:

- `jobId`;
- loteria;
- tipo de experimento;
- input/result/error;
- usuário ou qualquer identificador de requisição.

O objetivo é permitir detecção de backlog/falhas sem criar séries que crescem com dados do domínio.

## Fonte e consulta

`PostgresAnalysisJobRepository.metricsSnapshot()` executa uma única consulta agregada:

- `COUNT(*) FILTER (...)` para os cinco estados válidos;
- `MIN(created_at) FILTER (WHERE status = 'queued')` para identificar o job enfileirado mais antigo;
- nenhum `GROUP BY` por entidade do domínio.

A idade é calculada pelo PostgreSQL no momento do snapshot. Quando não há job em `queued`, `oldestQueuedAgeSeconds` é `null`; fila vazia não é representada como idade zero.

## Interpretação operacional

Esta fatia fornece sinais básicos, não SLOs finais:

- `queued` crescendo pode indicar backlog;
- `oldestQueuedAgeSeconds` crescendo indica espera acumulada;
- `running` ajuda a distinguir fila parada de processamento ativo;
- `failed` e `cancelled` são contadores de estado persistido, não taxas por janela temporal.

Thresholds e alertas só devem ser definidos depois de observar comportamento real da fila e custo dos experimentos. Não transformar estes números em tuning especulativo.

## Validação

A regressão automatizada cobre:

- mapeamento das cinco contagens;
- idade da fila retornada como número;
- fila vazia mantendo `null`;
- ausência de `GROUP BY` e de dimensões de alta cardinalidade na consulta.

Além disso, o gate padrão do repositório (`npm run check`) deve validar TypeScript, arquitetura e suíte funcional antes do merge.
