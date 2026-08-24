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

## Requisitos

- Node.js 24.19.0 LTS (linha 24.x; use `.nvmrc` para alinhar o ambiente local)
- npm
- Docker para PostgreSQL local

## Instalação

```bash
npm install
cp .env.example .env
```
