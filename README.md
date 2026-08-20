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
- importação idempotente do JSON atual;
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
- CORS e validação de entrada;
- testes HTTP com PostgreSQL real.

Detalhes em [`docs/API.md`](docs/API.md).

### Milestone 8 — interface web

- aplicação servida pelo mesmo processo HTTP da API;
- Dashboard com os últimos concursos das três loterias;
- Análises com grupos fortes/intermediários/frios e score detalhado;
- Gerar Jogos com persistência e concurso alvo;
- Meus Jogos com lotes e conferência automática;
- Backtests com ROI, custo, prêmio e cobertura financeira;
- layout responsivo para desktop, tablet e mobile;
- nenhum cálculo estatístico duplicado no navegador;
- teste do shell web e assets no CI.

Detalhes em [`docs/WEB.md`](docs/WEB.md).

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

Sem `DATABASE_URL`, os testes unitários e o teste de assets web rodam normalmente; testes que dependem de PostgreSQL são ignorados. No CI, um PostgreSQL real é iniciado automaticamente.

## Build

```bash
npm run build
```

## Rodar a aplicação completa

Suba o banco:

```bash
docker compose up -d postgres
```

O compose publica PostgreSQL na porta **5433** da máquina.

Configure a conexão:

```bash
export DATABASE_URL=postgresql://loto_lab:loto_lab@localhost:5433/loto_lab
```

Aplique migrations:

```bash
npm run db:migrate
```

Sincronize dados quando necessário:

```bash
npm run db:sync -- mega-sena
npm run db:sync -- lotofacil
npm run db:sync -- dia-de-sorte
```

Inicie o Loto Lab:

```bash
npm run api:start
```

Abra no navegador:

```text
http://127.0.0.1:3000
```

A interface web fica em `/` e a API continua disponível em `/api/v1`.

Health check:

```bash
curl http://127.0.0.1:3000/health/ready
```

## PostgreSQL

Importar o histórico JSON legado:

```bash
npm run db:import-json -- data/contests.json
```

Sincronizar diretamente da CAIXA:

```bash
npm run db:sync -- mega-sena
npm run db:sync -- lotofacil
npm run db:sync -- dia-de-sorte
```

## API HTTP

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

```bash
npm run data:sync -- mega-sena
npm run data:refresh -- lotofacil 3500 3767
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

Quando `targetContestNumber` é passado para a API ou interface de geração, a mesma regra é aplicada.

## Estrutura

```text
db/
└── migrations/

web/
├── index.html
├── styles.css
├── app.js
└── favicon.svg

src/
├── analysis/
├── api/
│   ├── app.ts
│   ├── http.ts
│   ├── server.ts
│   ├── services.ts
│   └── web.ts
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
├── METHODOLOGY.md
└── WEB.md
```

## Próximos milestones

1. laboratório visual para comparação de estratégias;
2. gráficos históricos e evolução de ROI/acertos;
3. estratégias configuráveis pela interface;
4. autenticação e apostas efetivamente realizadas;
5. camada de interpretação por IA.

## Aviso

O projeto organiza e mede estratégias de composição de jogos. Ele não garante prêmio, não prevê sorteios e não altera a probabilidade matemática individual de uma combinação válida.
