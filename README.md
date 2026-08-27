# Loto Lab

Motor de análise, geração, conferência e backtest estruturado para Mega-Sena, Lotofácil e Dia de Sorte.

> **Algoritmo calcula; IA interpreta.**

Frequências, scores, geração, conferência, custos, premiações, backtests e comparações precisam ser reproduzíveis por código. A IA entra para explicar resultados e sugerir hipóteses, não para inventar dezenas.

## Estado atual

### Milestone 1 — core

- domínio compartilhado das três loterias;
- análise por histórico, ano, mês, últimos 10 e últimos 20 concursos;
- score `strong / balanced / cold`;
- Mega-Sena com 3 fixas + 3 variáveis;
- metodologia em [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md).

### Milestone 2 — dados

- adapter da API oficial da CAIXA;
- armazenamento local JSON;
- sincronização incremental;
- backtest com proteção anti-leakage.

### Milestone 3 — geradores completos

- Lotofácil com núcleo de 8, 9 ou 10 fixas;
- Dia de Sorte com 3 fixas + 4 variáveis e Mês da Sorte;
- diversificação de repetição, pares/ímpares e estrutura.

### Milestone 4 — conferência e backtests

- checker único para as três loterias;
- separação de fixas e variáveis;
- faixas premiadas;
- backtests das três loterias;
- comparação da Lotofácil entre 8, 9 e 10 fixas.

### Milestone 5 — financeiro

- rateio e arrecadação reais da CAIXA;
- custo histórico da aposta;
- prêmio e resultado líquido por jogo;
- retorno, ROI e cobertura financeira.

Detalhes em [`docs/FINANCIALS.md`](docs/FINANCIALS.md).

### Milestone 6 — PostgreSQL

- migrations SQL versionadas;
- persistência de concursos, rateios, estratégias, lotes e backtests;
- importação idempotente do JSON legado;
- PostgreSQL local via Docker Compose;
- PostgreSQL real no CI.

Detalhes em [`docs/DATABASE.md`](docs/DATABASE.md).

### Milestone 7 — API HTTP

- API versionada em `/api/v1`;
- health checks;
- concursos e análise estatística;
- geração e conferência de lotes;
- estratégias;
- execução e persistência de backtests;
- CORS e validação de entrada.

Detalhes em [`docs/API.md`](docs/API.md).

### Milestone 8 — interface web

- Dashboard;
- Análises;
- Gerar Jogos;
- Meus Jogos;
- Backtests;
- layout responsivo;
- nenhum cálculo estatístico duplicado no navegador.

Detalhes em [`docs/WEB.md`](docs/WEB.md).

### Milestone 9 — base histórica e operação

- `db:bootstrap` idempotente e retomável;
- descoberta do último concurso oficial;
- preenchimento apenas de lacunas;
- retries e concorrência limitada;
- `db:status`;
- cobertura histórica/financeira no Dashboard;
- carregamento automático de `.env` nos comandos operacionais.

Detalhes em [`docs/DATA_OPERATIONS.md`](docs/DATA_OPERATIONS.md).

### Milestone 10 — Laboratório de Estratégias

- Mega-Sena: 0 vs 2 vs 3 fixas;
- Lotofácil: 8 vs 9 vs 10 fixas;
- Dia de Sorte: 0 vs 2 vs 3 fixas;
- mesmo período e quantidade de jogos para todas as variantes;
- ranking por ROI quando a cobertura financeira é suficiente;
- fallback para taxa de premiação quando o rateio histórico está incompleto;
- séries por blocos de concursos;
- gráficos de acertos, premiação, ROI e resultado líquido;
- interface em `/lab`.

Detalhes em [`docs/STRATEGY_LAB.md`](docs/STRATEGY_LAB.md).

## Roadmap

O roadmap técnico e de produto vigente está em [`docs/ROADMAP.md`](docs/ROADMAP.md).

Ele é a fonte de verdade para prioridades `Now / Next / Later`, dependências e critérios de pronto. Listas históricas de “próximos milestones” não devem ser mantidas no README.

## Requisitos

- Node.js 24.19.0 LTS (linha 24.x; use `.nvmrc` para alinhar o ambiente local)
- npm
- Docker para PostgreSQL local

## Instalação

```bash
npm install
cp .env.example .env
```

O `.env.example` já aponta para o PostgreSQL do compose em `localhost:5433`.

## Primeira carga local

```bash
docker compose up -d postgres
npm run db:migrate
npm run db:bootstrap
npm run db:status
```

O bootstrap pode ser interrompido e executado novamente. Concursos já armazenados são pulados.

## Rodar a aplicação

```bash
npm run api:start
```

Aplicação:

```text
http://127.0.0.1:3000
```

Laboratório:

```text
http://127.0.0.1:3000/lab
```

API:

```text
http://127.0.0.1:3000/api/v1
```

Health check:

```bash
curl http://127.0.0.1:3000/health/ready
```

## Testes

```bash
npm test
```

`npm test` propositalmente não carrega `.env` automaticamente, pois testes de integração podem limpar tabelas. No CI, um PostgreSQL isolado é iniciado automaticamente.

## Build

```bash
npm run build
```

## Operação dos dados

Carga histórica completa das três loterias:

```bash
npm run db:bootstrap
```

Uma loteria:

```bash
npm run db:bootstrap -- mega-sena
```

Status:

```bash
npm run db:status
```

Sync apenas do último concurso:

```bash
npm run db:sync -- mega-sena
npm run db:sync -- lotofacil
npm run db:sync -- dia-de-sorte
```

Detalhes em [`docs/DATA_OPERATIONS.md`](docs/DATA_OPERATIONS.md).

## API HTTP

Endpoints principais:

```text
GET  /api/v1/data/status
GET  /api/v1/lotteries
GET  /api/v1/contests/:lottery
GET  /api/v1/contests/:lottery/latest
GET  /api/v1/analysis/:lottery
POST /api/v1/games/generate
POST /api/v1/games/check
GET  /api/v1/game-batches/:lottery
GET  /api/v1/strategies
POST /api/v1/strategies
POST /api/v1/backtests/run
GET  /api/v1/backtests/:lottery
GET  /api/v1/backtest-runs/:id
POST /api/v1/lab/compare
```

## CLI de geração e conferência

```bash
npm run games:generate -- mega-sena data/contests.json 2
npm run games:generate -- lotofacil data/contests.json 4 8
npm run games:generate -- dia-de-sorte data/contests.json 4
npm run games:check -- data/games.json data/contests.json 3767
```

## Backtests por CLI

```bash
npm run backtest:mega -- data/contests.json 2 20 2500 3047
npm run backtest:lotofacil -- data/contests.json 4 8 20 3500 3767
npm run backtest:dia -- data/contests.json 4 20 1000 1277
npm run backtest:compare -- data/contests.json 4 20 3500 3767
```

## Métricas financeiras

- `totalCost`: custo de todos os jogos simulados;
- `financialCost`: custo dos jogos com rateio disponível;
- `totalPrizeValue`: soma dos prêmios reais conhecidos;
- `financialCoverage`: proporção de jogos com dados financeiros;
- `netResult`: prêmio menos custo coberto;
- `returnRate`: prêmio / custo coberto;
- `roi`: `(prêmio - custo coberto) / custo coberto`.

## Regra anti-leakage

Ao testar o concurso `N`, o gerador recebe **somente os concursos anteriores a N**. O resultado do próprio concurso e todos os concursos futuros ficam invisíveis para o algoritmo.

Essa regra vale para backtests tradicionais e para todas as variantes do Laboratório.

## Estrutura

```text
db/
└── migrations/

docs/
├── ROADMAP.md
├── MENTAL_MODEL.md
├── RELIABILITY.md
└── ...

web/
├── index.html
├── shell.js
├── feature-loader.js
├── app.js
└── features/assets por área

src/
├── ai/
├── analysis/
├── api/
├── backtest/
├── checker/
├── cli/
├── data/
├── db/
├── domain/
├── finance/
├── generator/
├── lab/
├── lotteries/
├── notifications/
├── observability/
├── operations/
├── persistence/
├── realBets/
└── index.ts
```

## Aviso

O projeto organiza e mede estratégias de composição de jogos. Ele não garante prêmio, não prevê sorteios e não altera a probabilidade matemática individual de uma combinação válida.
