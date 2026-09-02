# Loto Lab HTTP API

A API HTTP expõe as capacidades do Loto Lab sem duplicar regras estatísticas, financeiras ou de metodologia na camada de transporte.

O mesmo processo Node também serve a interface web.

## Arquitetura da borda HTTP

A direção atual é:

```text
HTTP controller
  ↓
Application use case
  ↓
Domain / engines / ports
  ↓
PostgreSQL / CAIXA / OpenAI / workers
```

Concursos, análises, geração compatível/Generator 2.0, backtests, estratégias, Strategy Lab, operações, apostas reais, status de dados, game batches, comparação de game batches e Agenda/notificações já entram por controllers dedicados e application use cases injetados, com dependências concretas compostas em `src/api/server.ts`. `src/api/app.ts` ficou restrito à borda comum da API e `src/api/services.ts` não possui mais facade de infraestrutura.

A migração da #61 ainda não terminou: `aiInsights.ts` e `analysisJobs.ts` continuam compondo provider/service/repositories concretos ou acessando `options.pool` dentro da borda HTTP. Essas fronteiras devem ser extraídas em fatias próprias antes de declarar `server.ts` como composition root completo.

Controllers devem cuidar de parse, CORS/auth/rate-limit quando aplicável, serialização e error mapping. Regras de negócio pertencem ao application/core.

## Execução local

```bash
cp .env.example .env
docker compose up -d postgres
npm run db:migrate
npm run api:start
```

Base local:

```text
http://127.0.0.1:5200
```

API:

```text
http://127.0.0.1:5200/api/v1
```

`npm run api:start` aplica migrations pendentes e inicia o scheduler quando `OPS_AUTO_SYNC=true`.

## Autenticação, origem e JSON

No ambiente local padrão não há credenciais.

Em produção, `APP_AUTH_USER` e `APP_AUTH_PASSWORD` protegem toda UI/API, exceto healthchecks.

Mutações passam por proteção same-origin. Requests com corpo usam `Content-Type: application/json`.

Cada resposta recebe `X-Request-Id` para correlação com logs.

## Health

```http
GET /health
GET /health/live
GET /health/ready
```

`/health/live` não consulta o banco. `/health` e `/health/ready` validam PostgreSQL.

## Loterias e concursos

```http
GET /api/v1/lotteries
GET /api/v1/contests/:lottery
GET /api/v1/contests/:lottery/latest
GET /api/v1/contests/:lottery/:contestNumber
```

Listagem de concursos aceita:

- `limit`: 1–200;
- `order`: `asc` ou `desc`;
- `startContest`;
- `endContest`.

## Análises

```http
GET /api/v1/analysis/:lottery
GET /api/v1/analysis/:lottery/advanced
```

A resposta básica permanece utilizável mesmo quando a análise avançada estiver ocupada ou falhar.

O contrato técnico pode manter nomes como `score` e `ranking`; a UI usa **pontuação** e **classificação**.

Detalhes: [`ANALYSES.md`](ANALYSES.md).

## Generator 2.0

Planejamento:

```http
POST /api/v1/generation/plan
```

Preview:

```http
POST /api/v1/generation/preview
```

Persistência:

```http
POST /api/v1/generation/save
```

Gerações diversificadas retornam seed auditável. Ao salvar uma prévia diversificada, a seed retornada pela prévia deve ser reutilizada.

Endpoint de compatibilidade:

```http
POST /api/v1/games/generate
```

Detalhes: [`GENERATION.md`](GENERATION.md).

## Lotes e conferência

```http
GET  /api/v1/game-batches/:lottery?limit=20
GET  /api/v1/game-batches/id/:id
GET  /api/v1/game-batches/:id/comparison?startContest=3760&count=5
POST /api/v1/games/check
```

A gestão de lifecycle de lotes expõe também consulta/arquivamento/restauração usados por **Meus Jogos**.

Uma comparação sem concursos ainda sincronizados pode retornar disponibilidade pendente sem transformar isso em erro 5xx.

Detalhes: [`MY_GAMES.md`](MY_GAMES.md).

## Apostas reais

Família principal:

```http
POST /api/v1/real-bets
GET  /api/v1/real-bets/:lottery?limit=50
POST /api/v1/real-bets/:id/check
POST /api/v1/real-bets/reconcile
GET  /api/v1/real-bets/:id/revisions
```

Apostas reais são separadas de lotes apenas gerados e de testes históricos. O backend impede registro retrospectivo quando o resultado oficial já era conhecido.

Detalhes: [`REAL_BETS.md`](REAL_BETS.md).

## Estratégias

```http
GET  /api/v1/strategies
GET  /api/v1/strategies?lottery=lotofacil
POST /api/v1/strategies
```

Estratégias possuem identificador estável e versões imutáveis para preservar auditabilidade.

## Testes históricos

```http
POST /api/v1/backtests/run
GET  /api/v1/backtests/:lottery?limit=20
GET  /api/v1/backtest-runs/:id
```

Execução síncrona usa worker + gate compartilhado e limite seguro de rounds. A persistência guarda artefatos compactos por rodada, sem estruturas pesadas usadas apenas durante cálculo.

## Laboratório

```http
POST /api/v1/lab/compare
```

O Laboratório compara variantes no mesmo recorte, respeitando anti-leakage, orçamento, controles aleatórios e limites de worker.

Detalhes: [`STRATEGY_LAB.md`](STRATEGY_LAB.md).

## Execuções / Analysis Jobs

```http
GET  /api/v1/analysis-jobs
POST /api/v1/analysis-jobs
GET  /api/v1/analysis-jobs/:id
POST /api/v1/analysis-jobs/:id/cancel
```

`kind` aceita:

- `backtest`;
- `strategy-lab`.

A criação valida loteria, estratégia/versionamento opcional, período e orçamento antes de enfileirar. A fila persistida diferencia `queued`, `running`, estados terminais e cancelamento.

## Operação e dados

Estado operacional:

```http
GET /api/v1/operations/status
```

Sincronização manual:

```http
POST /api/v1/operations/sync
```

Status da base:

```http
GET /api/v1/data/status
```

Scheduler, CLI e HTTP compartilham o mesmo contrato operacional e advisory lock.

Detalhes: [`OPERATIONS.md`](OPERATIONS.md).

## Agenda e notificações

```http
GET  /api/v1/agenda
GET  /api/v1/agenda?unread=true
POST /api/v1/notifications/:id/read
POST /api/v1/notifications/read-all
```

Detalhes: [`AGENDA.md`](AGENDA.md).

## IA

Status:

```http
GET /api/v1/ai/status
```

Gerar interpretação:

```http
POST /api/v1/ai/insights
```

Histórico:

```http
GET /api/v1/ai/insights/:lottery?limit=10
```

A IA recebe evidências calculadas e nunca substitui o core.

Detalhes: [`AI.md`](AI.md).

## Erros

Forma padrão:

```json
{
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "mensagem descritiva"
  }
}
```

Status comuns:

- `200`: leitura/execução não persistida;
- `201`: criação/persistência;
- `202`: trabalho assíncrono enfileirado;
- `204`: preflight/sem conteúdo;
- `400`: entrada inválida; alguns budgets de validação, como limites de unidades do Strategy Lab, também usam esse status;
- `401`: autenticação ausente/incorreta;
- `404`: rota/recurso inexistente;
- `409`: conflito de estado/operação;
- `413`: body acima do limite;
- `422`: request bem formado, mas inviável para execução segura/semântica — por exemplo ausência de combinações válidas no Generator 2.0 ou backtest acima do limite de rounds (`BACKTEST_LIMIT_EXCEEDED`);
- `429`: rate limit ou gate de trabalho caro ocupado;
- `500`: erro inesperado;
- `504`: timeout de execução pesada quando mapeado pelo controller.

Erros específicos mantêm `code` próprio, como `NO_VALID_COMBINATIONS`, `ALGORITHM_SPACE_UNSATISFIED`, `BACKTEST_LIMIT_EXCEEDED` e `ANALYSIS_TIMEOUT`, sem expor detalhes internos desnecessários.

## Produção

Por padrão:

```text
127.0.0.1:5200 -> app:3000
```

PostgreSQL não publica porta no host de produção.

Veja [`DEPLOYMENT.md`](DEPLOYMENT.md), [`RELIABILITY.md`](RELIABILITY.md) e [`QUALITY.md`](QUALITY.md).
