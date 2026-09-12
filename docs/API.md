# Loto Lab HTTP API

A API HTTP expõe as capacidades do Loto Lab sem duplicar regras estatísticas, financeiras ou de metodologia na camada de transporte. O mesmo processo Node também serve a interface web.

## Arquitetura da borda HTTP

```text
HTTP controller
  ↓
Application use case
  ↓
Domain / engines / ports
  ↓
PostgreSQL / CAIXA / OpenAI / workers
```

Concursos, análises, geração, game batches, backtests, estratégias, Strategy Lab, Analysis Jobs, operações, apostas reais, status de dados, Agenda/notificações, IA interpretativa e pesquisa/proveniência entram por controllers dedicados e application use cases injetados. Dependências concretas são compostas em `src/api/server.ts`.

`src/api/app.ts` fica restrito à borda comum da API; `src/api/services.ts` preserva apenas exports auxiliares compatíveis. Lifecycle de processo — start/recovery/drain da fila, scheduler e runtime lock — pertence a `src/cli/apiStart.ts`.

Controllers cuidam de parse, CORS/auth/rate-limit quando aplicável, serialização e error mapping. Regra de negócio pertence ao application/core.

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

No ambiente local padrão não há credenciais. Em produção, `APP_AUTH_USER` e `APP_AUTH_PASSWORD` protegem toda UI/API, exceto healthchecks.

Mutações passam por proteção same-origin. Requests com corpo usam `Content-Type: application/json`. Cada resposta recebe `X-Request-Id` para correlação com logs.

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

Listagem aceita `limit` (1–200), `order=asc|desc`, `startContest` e `endContest`.

## Análises

```http
GET /api/v1/analysis/:lottery
GET /api/v1/analysis/:lottery/advanced
```

A resposta básica permanece utilizável mesmo quando a análise avançada estiver ocupada ou falhar. O contrato técnico pode manter `score`/`ranking`; a UI usa **pontuação** e **classificação**.

Detalhes: [`ANALYSES.md`](ANALYSES.md).

## Generator 2.0

```http
POST /api/v1/generation/plan
POST /api/v1/generation/preview
POST /api/v1/generation/save
```

Gerações diversificadas retornam seed auditável. Ao salvar uma prévia diversificada, a seed retornada pela prévia deve ser reutilizada.

Compatibilidade:

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

A gestão de lifecycle de lotes também expõe consulta/arquivamento/restauração usados por **Meus Jogos**. Uma comparação sem concursos ainda sincronizados pode retornar disponibilidade pendente sem virar erro 5xx.

Detalhes: [`MY_GAMES.md`](MY_GAMES.md).

## Apostas reais

```http
POST /api/v1/real-bets
GET  /api/v1/real-bets/:lottery?limit=50
POST /api/v1/real-bets/:id/check
POST /api/v1/real-bets/reconcile
GET  /api/v1/real-bets/:id/revisions
```

Apostas reais são separadas de lotes apenas gerados e de testes históricos. O backend impede registro retrospectivo quando o resultado oficial já era conhecido.

Criação aceita proveniência de pesquisa opcional:

```json
{
  "batchId": 42,
  "contestNumber": 3001,
  "actualCost": 6.0,
  "gamePositions": [1, 2],
  "researchHypothesisId": 7
}
```

`researchHypothesisId` é opcional. Quando informado, a hipótese precisa existir, estar `decided` com decisão `applied-experimentally` e ser compatível com a loteria do lote. O vínculo é persistido na própria `real_bet`; a reconciliação posterior preserva o mesmo ID, permitindo rastrear custo, prêmio e resultado real até a hipótese sem snapshot paralelo.

Erros específicos:

- `RESEARCH_HYPOTHESIS_NOT_FOUND` — `404`;
- `RESEARCH_HYPOTHESIS_NOT_APPLICABLE` — `409`;
- `RESEARCH_HYPOTHESIS_LOTTERY_MISMATCH` — `409`.

Detalhes: [`REAL_BETS.md`](REAL_BETS.md) e [`FINANCIALS.md`](FINANCIALS.md).

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

`kind` aceita `backtest` e `strategy-lab`. A criação valida loteria, estratégia/versionamento opcional, período e orçamento antes de enfileirar.

O controller delega resolução de estratégia/config, validação dependente do histórico e operações de fila ao `AnalysisJobsUseCase`. O `AnalysisJobManager` singleton e dependências concretas são ligados em `src/api/server.ts`; `src/cli/apiStart.ts` cuida do lifecycle do manager.

## Operação e dados

```http
GET  /api/v1/operations/status
POST /api/v1/operations/sync
GET  /api/v1/data/status
```

O status operacional autenticado agrega sinais de HTTP, Analysis Jobs, sync, pool PostgreSQL, CAIXA e OpenAI. Esses snapshots são sinais de observabilidade; não são SLOs finais nem série histórica automaticamente persistida.

Detalhes: [`OPERATIONS.md`](OPERATIONS.md).

## Agenda e notificações

```http
GET  /api/v1/agenda
GET  /api/v1/agenda?unread=true
POST /api/v1/notifications/:id/read
POST /api/v1/notifications/read-all
```

Detalhes: [`AGENDA.md`](AGENDA.md).

## Pesquisa e proveniência

A raiz é uma hipótese humana persistida:

```http
POST /api/v1/research/hypotheses
GET  /api/v1/research/hypotheses
GET  /api/v1/research/hypotheses/:id
```

Criação usa:

```json
{
  "title": "hipótese a investigar",
  "description": "descrição auditável",
  "lottery": "mega-sena"
}
```

`lottery` pode ser omitida/nula para hipótese transversal. A listagem aceita `lottery` e `limit` (máximo 100).

Evidência canônica de backtest:

```http
POST /api/v1/research/hypotheses/:id/evidence/backtests
GET  /api/v1/research/hypotheses/:id/evidence/backtests
```

A associação usa:

```json
{
  "backtestRunId": 123
}
```

O vínculo aponta diretamente para `backtest_runs`; não copia o resultado para a hipótese nem cria `evidence_id` genérico. Hipótese decidida não recebe nova evidência, e hipótese restrita a uma loteria só aceita backtest compatível.

A decisão humana/auditável usa a mesma raiz persistida:

```http
POST /api/v1/research/hypotheses/:id/decision
```

Body:

```json
{
  "decision": "continue-testing",
  "reason": "justificativa humana auditável"
}
```

`decision` aceita `inconclusive`, `rejected`, `continue-testing` e `applied-experimentally`. A hipótese precisa estar `open`, possuir ao menos uma evidência de backtest persistida e receber uma justificativa de 1 a 4000 caracteres. A transição fecha a hipótese uma única vez; uma segunda decisão concorrente não sobrescreve a primeira.

Aplicações reais vinculadas à hipótese podem ser recuperadas por:

```http
GET /api/v1/research/hypotheses/:id/applications/real-bets
```

A resposta lista as `real_bets` canônicas associadas, incluindo o estado de conferência e, quando conhecido, custo/prêmio/resultado. Ausência de aplicações retorna `items: []`; hipótese inexistente retorna `404`. Não existe owner paralelo de aplicação nem cópia financeira na hipótese.

Nenhum ranking, p-value ou texto de IA decide automaticamente. `applied-experimentally` registra uma decisão humana de aplicação experimental e **não** representa comprovação de aumento de probabilidade futura.

Detalhes de persistência: [`DATABASE.md`](DATABASE.md).

## IA

```http
GET  /api/v1/ai/status
POST /api/v1/ai/insights
GET  /api/v1/ai/insights/:lottery?limit=10
```

A IA recebe evidências calculadas e nunca substitui o core. O controller delega status, geração, cache semântico e histórico ao `AiInsightsUseCase`; OpenAI e PostgreSQL são injetados no composition root.

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
- `400`: entrada inválida;
- `401`: autenticação ausente/incorreta;
- `404`: rota/recurso inexistente;
- `409`: conflito de estado/operação — inclusive lifecycle/loteria incompatível em proveniência;
- `413`: body acima do limite;
- `422`: request bem formado, mas inviável para execução segura/semântica;
- `429`: rate limit ou gate de trabalho caro ocupado;
- `500`: erro inesperado;
- `504`: timeout de execução pesada quando mapeado pelo controller.

Erros específicos mantêm `code` próprio sem expor detalhes internos desnecessários.

## Produção

Por padrão:

```text
127.0.0.1:5200 -> app:3000
```

PostgreSQL não publica porta no host de produção.

Veja [`PRODUCTION.md`](PRODUCTION.md), [`DEPLOYMENT.md`](DEPLOYMENT.md), [`RELIABILITY.md`](RELIABILITY.md) e [`QUALITY.md`](QUALITY.md).
