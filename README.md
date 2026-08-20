# Loto Lab

Motor de análise, geração, conferência e backtest estruturado para Mega-Sena, Lotofácil e Dia de Sorte.

> **Algoritmo calcula; IA interpreta.**

Frequências, scores, geração, conferência, custos, premiações e backtests precisam ser reproduzíveis por código. A IA entra para explicar resultados e sugerir hipóteses, não para inventar dezenas.

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
- retorno, ROI e cobertura financeira;
- comparação de estratégias usando métricas financeiras.

Detalhes em [`docs/FINANCIALS.md`](docs/FINANCIALS.md).

### Milestone 6 — PostgreSQL

- migrations SQL versionadas;
- pool de conexões com `pg`;
- persistência de concursos e rateios;
- persistência de estratégias versionadas;
- persistência de lotes de jogos;
- persistência de backtests e rodadas;
- métricas financeiras indexáveis para futuros dashboards;
- importação idempotente do JSON atual;
- PostgreSQL local via Docker Compose;
- PostgreSQL real no CI para testes de integração.

Detalhes em [`docs/DATABASE.md`](docs/DATABASE.md).

### Milestone 7 — API HTTP

- API versionada em `/api/v1`;
- health checks de liveness e readiness;
- consultas de concursos com paginação limitada e ordenação no SQL;
- análise estatística por loteria;
- geração de jogos com persistência em lote;
- conferência de lotes contra concursos armazenados;
- cadastro/listagem de estratégias;
- execução e persistência de backtests;
- listagem leve de backtests sem carregar todas as rodadas;
- CORS configurável para o futuro frontend;
- testes HTTP de integração usando PostgreSQL real no CI.

Detalhes em [`docs/API.md`](docs/API.md).

## Requisitos

- Node.js 22+
- npm
- Docker, opcional para PostgreSQL local

## Instalação

```bash
npm install
```

## Testes

```bash
npm test
```

Sem `DATABASE_URL`, os testes unitários rodam normalmente e os testes PostgreSQL/API são ignorados. No CI, um PostgreSQL real é iniciado automaticamente.

## Build

```bash
npm run build
```

## PostgreSQL local

Subir o banco:

```bash
docker compose up -d postgres
```

O compose publica PostgreSQL na porta **5433** da máquina para não conflitar com instalações locais em 5432.

Configurar a conexão:

```bash
export DATABASE_URL=postgresql://loto_lab:loto_lab@localhost:5433/loto_lab
```

Aplicar migrations:

```bash
npm run db:migrate
```

Importar o histórico JSON já existente:

```bash
npm run db:import-json -- data/contests.json
```

Sincronizar a CAIXA diretamente com PostgreSQL:

```bash
npm run db:sync -- mega-sena
npm run db:sync -- lotofacil
npm run db:sync -- dia-de-sorte
```

## API HTTP

Configuração local recomendada:

```bash
export API_HOST=127.0.0.1
export API_PORT=3000
export API_CORS_ORIGIN=http://localhost:5173
```

Iniciar:

```bash
npm run api:start
```

Health check:

```bash
curl http://127.0.0.1:3000/health/ready
```

Alguns endpoints:

```text
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
```

Veja exemplos completos em [`docs/API.md`](docs/API.md).

## Dados JSON legados

Os comandos baseados em JSON continuam disponíveis durante a transição e os arquivos da pasta `data/` não são versionados.

Buscar o concurso mais recente:

```bash
npm run data:sync -- mega-sena
npm run data:sync -- lotofacil
npm run data:sync -- dia-de-sorte
```

Preencher concursos ausentes:

```bash
npm run data:sync -- mega-sena 2500 3047
```

Enriquecer concursos existentes com rateio/arrecadação:

```bash
npm run data:refresh -- mega-sena 2500 3047
npm run data:refresh -- lotofacil 3500 3767
npm run data:refresh -- dia-de-sorte 1000 1277
```

## CLI de geração e conferência

Gerar:

```bash
npm run games:generate -- mega-sena data/contests.json 2
npm run games:generate -- lotofacil data/contests.json 4 8
npm run games:generate -- dia-de-sorte data/contests.json 4
```

Conferir:

```bash
npm run games:check -- data/games.json data/contests.json 3767
```

## Backtests por CLI

Mega-Sena:

```bash
npm run backtest:mega -- data/contests.json 2 20 2500 3047
```

Lotofácil:

```bash
npm run backtest:lotofacil -- data/contests.json 4 8 20 3500 3767
```

Dia de Sorte:

```bash
npm run backtest:dia -- data/contests.json 4 20 1000 1277
```

Comparação 8/9/10 fixas da Lotofácil:

```bash
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

Quando `targetContestNumber` é passado para a API de geração, a mesma regra é aplicada: apenas concursos anteriores ao alvo são usados.

## Estrutura

```text
db/
└── migrations/

src/
├── analysis/
├── api/
│   ├── app.ts
│   ├── http.ts
│   └── services.ts
├── backtest/
├── checker/
├── cli/
├── data/
├── db/
├── domain/
├── finance/
├── generator/
├── lotteries/
├── persistence/
└── index.ts

docs/
├── API.md
├── DATABASE.md
├── FINANCIALS.md
└── METHODOLOGY.md
```

## Próximos milestones

1. interface web;
2. dashboard com próximos concursos, análises e jogos ativos;
3. telas de geração, conferência e histórico;
4. laboratório visual de backtests e estratégias;
5. camada de interpretação por IA.

## Aviso

O projeto organiza e mede estratégias de composição de jogos. Ele não garante prêmio, não prevê sorteios e não altera a probabilidade matemática individual de uma combinação válida.
