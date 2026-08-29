# Loto Lab

Motor de análise, geração, conferência, testes históricos e laboratório de estratégias para Mega-Sena, Lotofácil e Dia de Sorte.

> **Algoritmo calcula; IA interpreta.**

Frequências, pontuações, geração, conferência, custos, premiações, testes históricos e comparações são reproduzíveis por código. A IA recebe evidências já calculadas para explicar resultados e sugerir hipóteses; ela não inventa dezenas nem substitui o core estatístico.

## Estado atual

O Loto Lab hoje combina:

- PostgreSQL como persistência principal;
- sincronização incremental e bootstrap histórico com dados oficiais da CAIXA;
- análise básica e workspace avançado de Análises 2.0;
- geração determinística ou diversificada com seed auditável;
- conferência de jogos e apostas reais;
- testes históricos com proteção anti-leakage;
- Laboratório de Estratégias para comparação controlada;
- fila persistente para trabalhos pesados;
- scheduler operacional para manter concursos e apostas atualizados;
- Agenda, Estratégias, Execuções e interpretação opcional por IA;
- frontend sem framework servido pelo mesmo processo HTTP da API;
- stack Docker de produção com PostgreSQL privado e autenticação HTTP Basic.

O roadmap vigente está em [`docs/ROADMAP.md`](docs/ROADMAP.md). Ele é a fonte de verdade para prioridades `Now / Next / Later` e critérios de pronto.

## Requisitos

- Node.js 24.19.0 LTS, linha 24.x (`.nvmrc`);
- npm;
- Docker + Docker Compose v2 para PostgreSQL local e stack de produção.

## Portas padrão

| Serviço | Host local | Container / serviço interno |
| --- | --- | --- |
| Aplicação + API | `127.0.0.1:5200` | `5200` no processo local; `3000` dentro do container de produção |
| PostgreSQL local | `localhost:5434` | `5432` |
| PostgreSQL em produção | não publicado no host | `5432` na rede Docker |

As portas configuradas em `.env.example`, `.env.production.example` e nos arquivos Compose são a fonte de verdade operacional.

## Instalação local

```bash
npm install
cp .env.example .env
```

O `.env.example` atual usa:

```env
DATABASE_URL=postgresql://loto_lab:loto_lab@localhost:5434/loto_lab
API_HOST=127.0.0.1
API_PORT=5200
OPS_AUTO_SYNC=true
OPS_INTERVAL_MINUTES=30
OPS_STALE_AFTER_MINUTES=180
```

Em desenvolvimento local, deixe `API_CORS_ORIGIN` e `PUBLIC_ORIGIN` sem definir salvo quando houver necessidade explícita de outro origin.

## Primeira carga local

Suba o PostgreSQL:

```bash
docker compose up -d postgres
```

Aplique migrations e carregue o histórico:

```bash
npm run db:migrate
npm run db:bootstrap
npm run db:status
```

O bootstrap é idempotente e retomável. Concursos já persistidos são pulados e somente lacunas são buscadas novamente.

## Rodar a aplicação

```bash
npm run api:start
```

A aplicação, o frontend e a API são servidos pelo mesmo processo:

```text
Aplicação:   http://127.0.0.1:5200
API:         http://127.0.0.1:5200/api/v1
Health:      http://127.0.0.1:5200/health/ready
Laboratório: http://127.0.0.1:5200/lab
```

Teste rápido:

```bash
curl http://127.0.0.1:5200/health/ready
```

`npm run api:start` carrega `.env`, aplica migrations pendentes e inicia o scheduler operacional quando `OPS_AUTO_SYNC=true`.

## Interface web

A aplicação principal possui:

- **Painel** — concursos, cobertura da base, desempenho e estado operacional;
- **Análises** — classificação auditável, estrutura, dinâmica, combinações e validação;
- **Gerar jogos** — planejamento, seleção, preview e persistência auditável;
- **Meus jogos** — lotes persistidos, comparação, conferência e apostas reais;
- **Testes históricos** — simulações e execuções persistidas.

Áreas dedicadas:

```text
/lab         Laboratório de Estratégias
/strategies  Estratégias e versões
/jobs        Execuções persistidas
/agenda      Agenda e notificações
/ai          Interpretação de evidências por IA
```

Detalhes em [`docs/WEB.md`](docs/WEB.md).

## Operação dos dados

Carga histórica completa:

```bash
npm run db:bootstrap
```

Uma loteria:

```bash
npm run db:bootstrap -- mega-sena
npm run db:bootstrap -- lotofacil
npm run db:bootstrap -- dia-de-sorte
```

Sincronização pontual do último concurso:

```bash
npm run db:sync -- mega-sena
npm run db:sync -- lotofacil
npm run db:sync -- dia-de-sorte
```

Sincronização operacional das três loterias, incluindo reconciliação de apostas reais pendentes:

```bash
npm run ops:sync
```

Status da base:

```bash
npm run db:status
```

Detalhes em [`docs/DATA_OPERATIONS.md`](docs/DATA_OPERATIONS.md) e [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

## API HTTP

Base local:

```text
http://127.0.0.1:5200/api/v1
```

Endpoints principais incluem:

```text
GET  /api/v1/data/status
GET  /api/v1/operations/status
POST /api/v1/operations/sync
GET  /api/v1/lotteries
GET  /api/v1/contests/:lottery
GET  /api/v1/contests/:lottery/latest
GET  /api/v1/analysis/:lottery
GET  /api/v1/analysis/:lottery/advanced
POST /api/v1/generation/plan
POST /api/v1/generation/preview
POST /api/v1/generation/save
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

Os nomes `score`, `ranking` e `backtests` podem permanecer em contratos internos/API por compatibilidade; a copy visível do produto usa **pontuação**, **classificação** e **testes históricos**.

Detalhes em [`docs/API.md`](docs/API.md).

## CLI de geração e conferência

```bash
npm run games:generate -- mega-sena data/contests.json 2
npm run games:generate -- lotofacil data/contests.json 4 8
npm run games:generate -- dia-de-sorte data/contests.json 4
npm run games:check -- data/games.json data/contests.json 3767
```

## Testes históricos por CLI

Os nomes dos scripts mantêm `backtest` por compatibilidade técnica:

```bash
npm run backtest:mega -- data/contests.json 2 20 2500 3047
npm run backtest:lotofacil -- data/contests.json 4 8 20 3500 3767
npm run backtest:dia -- data/contests.json 4 20 1000 1277
npm run backtest:compare -- data/contests.json 4 20 3500 3767
```

## Qualidade e testes

Quality gates estáticos:

```bash
npm run quality:static
```

Build + testes com cobertura:

```bash
npm test
```

E2E em navegador real:

```bash
npm run e2e:browser
```

Build isolado:

```bash
npm run build
```

`npm test` propositalmente não carrega `.env` automaticamente, pois testes de integração podem limpar tabelas. No CI, um PostgreSQL isolado é iniciado automaticamente.

## Produção com Docker Compose

Crie a configuração local de produção:

```bash
cp .env.production.example .env.production
```

O template usa por padrão:

```env
APP_BIND=127.0.0.1
APP_PORT=5200
PUBLIC_ORIGIN=http://localhost:5200
```

A stack de produção exige credenciais HTTP Basic para toda a UI/API, exceto health checks:

```env
APP_AUTH_USER=loto-admin
APP_AUTH_PASSWORD=troque-por-uma-senha-longa
POSTGRES_PASSWORD=troque-por-outra-senha-longa
```

Valide e suba:

```bash
npm run prod:config
npm run prod:up
```

Health check no host com a configuração padrão:

```bash
curl -f http://127.0.0.1:5200/health/ready
```

A aplicação escuta `3000` **dentro do container**, mas é publicada no host pela variável `APP_PORT`, cujo padrão atual é `5200`. O PostgreSQL de produção não publica porta no host.

Para acesso fora de uma rede confiável, mantenha a aplicação atrás de reverse proxy com HTTPS e configure `PUBLIC_ORIGIN` com a origem pública correta.

Detalhes completos em [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Métricas financeiras

- `totalCost`: custo de todos os jogos simulados;
- `financialCost`: custo dos jogos com rateio disponível;
- `totalPrizeValue`: soma dos prêmios reais conhecidos;
- `financialCoverage`: proporção de jogos com dados financeiros;
- `netResult`: prêmio menos custo coberto;
- `returnRate`: prêmio / custo coberto;
- `roi`: `(prêmio - custo coberto) / custo coberto`.

Detalhes em [`docs/FINANCIALS.md`](docs/FINANCIALS.md).

## Regra anti-leakage

Ao testar o concurso `N`, o gerador recebe **somente concursos anteriores a N**. O resultado do próprio concurso e todos os concursos futuros ficam invisíveis para o algoritmo.

Essa regra vale para testes históricos tradicionais, validações fora da amostra e variantes do Laboratório.

## Estrutura principal

```text
db/
└── migrations/

docs/
├── ROADMAP.md
├── DEPLOYMENT.md
├── WEB.md
├── API.md
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

## Documentação

- [`docs/ROADMAP.md`](docs/ROADMAP.md) — prioridades vigentes;
- [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) — metodologia estatística;
- [`docs/ANALYSES.md`](docs/ANALYSES.md) — Análises 2.0;
- [`docs/GENERATION.md`](docs/GENERATION.md) — geração;
- [`docs/MY_GAMES.md`](docs/MY_GAMES.md) — Meus jogos e apostas reais;
- [`docs/STRATEGY_LAB.md`](docs/STRATEGY_LAB.md) — Laboratório;
- [`docs/DATABASE.md`](docs/DATABASE.md) — persistência;
- [`docs/DATA_OPERATIONS.md`](docs/DATA_OPERATIONS.md) — carga e sincronização;
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — scheduler e operação automática;
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — produção e segurança.

## Aviso

O projeto organiza e mede estratégias de composição de jogos. Ele não garante prêmio, não prevê sorteios e não altera a probabilidade matemática individual de uma combinação válida.
