# Loto Lab HTTP API

A API HTTP expõe o core estatístico e a persistência PostgreSQL sem duplicar regras de negócio. O mesmo processo também serve a interface web.

## Princípios

- o algoritmo é a fonte de verdade para análise, geração, conferência e testes históricos;
- a API valida entrada, chama serviços e serializa respostas;
- concursos, lotes, estratégias, apostas reais, execuções e testes históricos persistidos usam PostgreSQL;
- testes históricos e validações respeitam a regra anti-leakage;
- operações pesadas usam limites, rate limiting e workers quando aplicável;
- em produção, toda UI/API exceto health checks exige HTTP Basic.

## Execução local

Suba o PostgreSQL:

```bash
docker compose up -d postgres
```

Crie o ambiente local:

```bash
cp .env.example .env
```

Valores padrão atuais:

```env
DATABASE_URL=postgresql://loto_lab:loto_lab@localhost:5434/loto_lab
API_HOST=127.0.0.1
API_PORT=5200
```

Aplique migrations quando estiver preparando a base pela primeira vez:

```bash
npm run db:migrate
```

Inicie a aplicação/API:

```bash
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

`npm run api:start` carrega `.env`, aplica migrations pendentes e inicia o scheduler operacional quando habilitado.

## CORS e origem pública

Em desenvolvimento local, `API_CORS_ORIGIN` e `PUBLIC_ORIGIN` podem ficar sem definição. O servidor deriva a origem do próprio host e aceita o uso local por `localhost` ou `127.0.0.1`.

Defina uma origem explícita apenas quando a API for consumida por outro origin ou quando houver uma origem pública conhecida.

## Autenticação

No ambiente local padrão não há credenciais configuradas.

Na stack de produção, `APP_AUTH_USER` e `APP_AUTH_PASSWORD` são obrigatórios e protegem toda a UI/API com HTTP Basic. Estes endpoints permanecem públicos para health checks:

```text
/health
/health/live
/health/ready
```

Consulte [`DEPLOYMENT.md`](DEPLOYMENT.md) para exposição segura e HTTPS.

## Health checks

### Liveness

```http
GET /health/live
```

Não consulta o banco.

### Readiness

```http
GET /health/ready
```

Executa uma consulta simples no PostgreSQL.

## Loterias e concursos

```http
GET /api/v1/lotteries
GET /api/v1/contests/mega-sena?limit=20&order=desc
GET /api/v1/contests/mega-sena/latest
GET /api/v1/contests/mega-sena/3047
```

Parâmetros de listagem de concursos:

- `limit`: 1 a 200;
- `order`: `asc` ou `desc`;
- `startContest`: concurso mínimo opcional;
- `endContest`: concurso máximo opcional.

## Análises

Resposta principal:

```http
GET /api/v1/analysis/lotofacil
```

Workspace avançado:

```http
GET /api/v1/analysis/lotofacil/advanced
```

Os contratos internos ainda podem usar nomes como `score` e `ranking`; a interface visível usa **pontuação** e **classificação**.

Detalhes em [`ANALYSES.md`](ANALYSES.md).

## Gerador 2.0

Planejamento sem gerar jogos:

```http
POST /api/v1/generation/plan
Content-Type: application/json
```

Preview não persistido:

```http
POST /api/v1/generation/preview
Content-Type: application/json
```

Persistência de uma geração validada:

```http
POST /api/v1/generation/save
Content-Type: application/json
```

A geração pode ser determinística ou diversificada. Gerações diversificadas usam seed auditável; ao salvar uma prévia diversificada, a seed retornada pela geração anterior deve ser reutilizada.

O endpoint legado/compatível continua disponível:

```http
POST /api/v1/games/generate
```

Detalhes em [`GENERATION.md`](GENERATION.md).

## Lotes e conferência

```http
GET  /api/v1/game-batches/lotofacil?limit=20
GET  /api/v1/game-batches/id/1
GET  /api/v1/game-batches/1/comparison?startContest=3760&count=5
POST /api/v1/games/check
```

Uma comparação sem resultados sincronizados retorna `200` com `availability.status = "pending"`; isso representa indisponibilidade temporária do concurso, não falha de servidor.

Detalhes em [`MY_GAMES.md`](MY_GAMES.md).

## Estratégias

```http
GET  /api/v1/strategies
GET  /api/v1/strategies?lottery=lotofacil
POST /api/v1/strategies
```

Estratégias usam identificador estável e versões imutáveis para preservar auditabilidade.

## Testes históricos

Os paths mantêm `backtests` por compatibilidade técnica:

```http
POST /api/v1/backtests/run
GET  /api/v1/backtests/lotofacil?limit=20
GET  /api/v1/backtest-runs/1
```

Chamadas web possuem limites de jogos e concursos para proteger CPU/memória. O cálculo pesado roda fora do event loop principal quando aplicável.

## Laboratório

```http
POST /api/v1/lab/compare
```

O Laboratório compara variantes no mesmo período e com a mesma quantidade de jogos, preservando anti-leakage e controles aleatórios quando aplicável.

Detalhes em [`STRATEGY_LAB.md`](STRATEGY_LAB.md).

## Operação

Estado operacional:

```http
GET /api/v1/operations/status
```

Sincronização manual das três loterias:

```http
POST /api/v1/operations/sync
```

A operação compartilha advisory lock com scheduler e CLI. Se já houver sincronização ativa, uma nova chamada não inicia trabalho duplicado.

Status da base:

```http
GET /api/v1/data/status
```

Detalhes em [`OPERATIONS.md`](OPERATIONS.md).

## Erros

Erros de validação e recursos ausentes seguem a forma:

```json
{
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "mensagem descritiva"
  }
}
```

Status comuns:

- `200`: leitura ou execução não persistida;
- `201`: criação/persistência;
- `204`: preflight CORS;
- `400`: entrada inválida;
- `401`: autenticação ausente/incorreta quando habilitada;
- `404`: rota/recurso inexistente;
- `409`: conflito operacional, como sincronização já em andamento;
- `413`: body acima do limite;
- `429`: rate limit;
- `500`: erro inesperado de servidor/banco.

## Produção

A aplicação escuta `3000` dentro do container de produção e é publicada no host por `APP_PORT`, cujo padrão atual é `5200`:

```text
Host:      127.0.0.1:5200
Container: app:3000
```

O PostgreSQL de produção não publica porta no host. Consulte [`DEPLOYMENT.md`](DEPLOYMENT.md).
