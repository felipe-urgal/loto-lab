# Loto Lab HTTP API

A API HTTP expõe o core estatístico e a persistência PostgreSQL sem duplicar regras de negócio.

## Princípios

- o algoritmo continua sendo a fonte de verdade para análise, geração, conferência e backtest;
- a API apenas valida entrada, chama os serviços e serializa a resposta;
- concursos, lotes de jogos, estratégias e backtests persistidos usam PostgreSQL;
- backtests continuam respeitando a regra anti-leakage existente no core;
- a API não autentica usuários neste milestone.

## Execução local

Suba o PostgreSQL:

```bash
docker compose up -d postgres
```

Configure o ambiente:

```bash
export DATABASE_URL=postgresql://loto_lab:loto_lab@localhost:5433/loto_lab
export API_HOST=127.0.0.1
export API_PORT=3000
export API_CORS_ORIGIN=http://localhost:5173
```

Aplique migrations:

```bash
npm run db:migrate
```

Inicie a API:

```bash
npm run api:start
```

Base local:

```text
http://127.0.0.1:3000
```

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

## Loterias

```http
GET /api/v1/lotteries
```

Retorna as configurações de Mega-Sena, Lotofácil e Dia de Sorte.

## Concursos

### Últimos concursos

```http
GET /api/v1/contests/mega-sena?limit=20&order=desc
```

Query params:

- `limit`: 1 a 200;
- `order`: `asc` ou `desc`;
- `startContest`: concurso mínimo opcional;
- `endContest`: concurso máximo opcional.

### Concurso mais recente

```http
GET /api/v1/contests/mega-sena/latest
```

### Concurso específico

```http
GET /api/v1/contests/mega-sena/3047
```

## Análise

```http
GET /api/v1/analysis/lotofacil
```

A resposta contém:

- concurso de referência mais recente;
- pesos atuais do score;
- grupos `strong`, `balanced` e `cold`;
- score e componentes por dezena.

## Gerar jogos

```http
POST /api/v1/games/generate
Content-Type: application/json
```

Mega-Sena:

```json
{
  "lottery": "mega-sena",
  "gameCount": 3
}
```

Lotofácil:

```json
{
  "lottery": "lotofacil",
  "gameCount": 4,
  "fixedCount": 8
}
```

Dia de Sorte:

```json
{
  "lottery": "dia-de-sorte",
  "gameCount": 4
}
```

Campos opcionais:

- `targetContestNumber`: se informado, somente concursos anteriores a ele entram na geração;
- `persist`: `true` por padrão. Quando `true`, cria um lote em PostgreSQL.

A geração persiste o lote como uma unidade, preservando o núcleo compartilhado e as opções usadas.

## Lotes de jogos

### Lotes recentes

```http
GET /api/v1/game-batches/lotofacil?limit=20
```

### Lote específico

```http
GET /api/v1/game-batches/id/1
```

## Comparar jogos do lote

```http
GET /api/v1/game-batches/1/comparison?startContest=3760&count=5
```

Compara os jogos persistidos do lote com os concursos a partir de `startContest`. O concurso inicial pode ser anterior ao concurso-alvo do lote, permitindo **backtest histórico** dos jogos gerados.

Query params:

- `startContest`: concurso inicial da comparação; opcional, usando o concurso-alvo do lote quando disponível;
- `count`: quantidade de concursos, de 1 a 20, com padrão 5.

A resposta inclui:

- `targetContestNumber`: concurso para o qual o lote foi originalmente gerado;
- `startContestNumber`: concurso usado para iniciar a comparação;
- `summary`: resumo dos acertos;
- `items`: resultados por concurso;
- `availability.status`: `available` quando há concursos sincronizados para o intervalo solicitado ou `pending` quando o concurso inicial ainda não está disponível;
- `availability.lastAvailableContestNumber`: último concurso conhecido, quando aplicável;
- `scope.kind`: `backtest` quando a comparação começa antes do alvo do lote ou `post-target` quando começa no alvo/depois dele.

Quando `availability.status` é `pending`, a API continua respondendo `200` com `items: []` e resumo zerado. Isso representa ausência temporária do resultado sincronizado, não um erro de servidor.

Exemplo de resposta pendente:

```json
{
  "targetContestNumber": 3768,
  "startContestNumber": 3768,
  "requestedCount": 5,
  "availability": {
    "status": "pending",
    "targetContestNumber": 3768,
    "lastAvailableContestNumber": 3767
  },
  "items": []
}
```

Exemplo de backtest:

```http
GET /api/v1/game-batches/1/comparison?startContest=3760&count=5
```

Nesse caso, um lote originalmente gerado para o concurso 3768 pode ser comparado com 3760, 3761, 3762, 3763 e 3764, desde que esses concursos estejam sincronizados.

## Conferir lote

```http
POST /api/v1/games/check
Content-Type: application/json
```

```json
{
  "batchId": 1,
  "contestNumber": 3767
}
```

A resposta inclui o lote, o concurso e a conferência de cada jogo:

- acertos;
- acertos das fixas;
- acertos das variáveis;
- faixa premiada;
- custo;
- prêmio conhecido;
- resultado líquido;
- Mês da Sorte quando aplicável.

## Estratégias

### Listar

```http
GET /api/v1/strategies
GET /api/v1/strategies?lottery=lotofacil
```

### Criar ou atualizar pelo slug

```http
POST /api/v1/strategies
Content-Type: application/json
```

```json
{
  "slug": "lotofacil-core-8",
  "lottery": "lotofacil",
  "name": "Lotofácil 8 fixas",
  "methodologyVersion": "1",
  "config": {
    "fixedCount": 8
  }
}
```

## Rodar backtest

```http
POST /api/v1/backtests/run
Content-Type: application/json
```

Exemplo Lotofácil:

```json
{
  "lottery": "lotofacil",
  "gameCount": 4,
  "fixedCount": 8,
  "warmupContests": 20,
  "startContest": 3500,
  "endContest": 3767
}
```

Campos:

- `lottery`: obrigatório;
- `gameCount`: opcional;
- `fixedCount`: somente Lotofácil, aceita 8, 9 ou 10;
- `warmupContests`: padrão 20;
- `startContest` e `endContest`: opcionais;
- `persist`: `true` por padrão.

O endpoint é síncrono neste milestone. Ele é adequado para os backtests atuais; execução assíncrona/job queue pode ser adicionada se os experimentos crescerem em custo.

## Backtests persistidos

### Listagem leve

```http
GET /api/v1/backtests/lotofacil?limit=20
```

A listagem retorna resumo e `roundCount`, sem carregar todos os payloads das rodadas.

### Execução completa

```http
GET /api/v1/backtest-runs/1
```

Retorna também as rodadas persistidas.

## Erros

Erros de validação e recursos ausentes seguem a forma:

```json
{
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "gameCount must be an integer between 1 and 20"
  }
}
```

Status usados neste milestone:

- `200`: leitura ou execução não persistida;
- `201`: criação/persistência;
- `204`: preflight CORS;
- `400`: entrada inválida;
- `404`: rota/recurso inexistente;
- `413`: body acima de 1 MB;
- `500`: erro inesperado de servidor/banco.

Uma comparação sem resultados sincronizados continua sendo `200` com `availability.status = "pending"`; não é classificada como erro `500`.

## CORS

Por padrão a API permite a origem configurada em `API_CORS_ORIGIN`.

O valor local recomendado é:

```text
http://localhost:5173
```

Isso já prepara a integração com o frontend Vite do próximo milestone.
