# Loto Lab

Motor auditável de análise, geração, conferência, testes históricos e experimentação para **Mega-Sena**, **Lotofácil** e **Dia de Sorte**.

> **Algoritmo calcula; IA interpreta.**

O Loto Lab transforma hipóteses em regras explícitas, executa cálculos determinísticos e mede resultados sem olhar o futuro. Frequência, score, ranking e estrutura descrevem evidência histórica; não alteram a probabilidade matemática individual do próximo sorteio.

| Baseline | Valor |
| --- | --- |
| Versão | `0.6.0` |
| Runtime | Node.js 24.20.0 LTS / linha 24.x |
| TypeScript | 7.x |
| Persistência | PostgreSQL 16 |
| Frontend | HTML + CSS + ES Modules com owners TypeScript incrementais |
| Backend | Node.js + TypeScript |

## Estado atual

Baseline reconciliada em **2026-09-11**:

- PostgreSQL é a fonte de verdade operacional, com migrations forward-only, checksum e advisory lock;
- `src/api/server.ts` é o composition root HTTP e controllers delegam regra a application use cases;
- o frontend continua sem framework e possui owners canônicos em `web/src` para core, features e primitives compartilhadas;
- análises, geração, backtests, Strategy Lab e financeiro preservam reprodutibilidade, anti-leakage e a distinção entre desconhecido e zero conhecido;
- `research_hypotheses` persiste hipótese humana, pode vincular evidência canônica de `backtest_run` e suporta decisão humana/auditável;
- observabilidade cobre HTTP, Analysis Jobs, sync, PostgreSQL, CAIXA e OpenAI;
- produção possui `prod:resources` para baseline comparável antes de tuning;
- a decomposição do hotspot `src/analysis/advanced.ts` foi concluída na #62: continuidade, estatística, estrutura, associações, ciclos, dinâmica/ranking e rolling validation possuem owners próprios;
- `npm run check` é o gate funcional canônico;
- a `main` ainda não possui branch protection obrigatória; isso permanece como configuração administrativa da #52.

Prioridade e dependências atuais: [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Princípios

1. **Reprodutibilidade.** Seeds, períodos, estratégias, versões, inputs e outputs relevantes devem permitir auditoria/replay.
2. **Anti-leakage.** Um concurso alvo nunca entra nos dados usados para gerar, classificar, calibrar ou decidir antes de seu resultado ser revelado.
3. **Sem promessa de previsão.** Histórico não vira aumento de probabilidade futura sem modelo e evidência formal válidos.
4. **IA fora do cálculo crítico.** IA interpreta evidências; matemática, geração, conferência, financeiro e testes permanecem no código.
5. **Proveniência explícita.** Hipóteses, runs, evidências e decisões reutilizam identidades canônicas.
6. **Desconhecido não é zero.** Ausência de dado e valor `0` possuem semânticas distintas.
7. **Performance baseada em evidência.** Índice, cache, timeout, concorrência e limite de recurso exigem baseline comparável.

## Loterias suportadas

| Produto | ID técnico |
| --- | --- |
| Mega-Sena | `mega-sena` |
| Lotofácil | `lotofacil` |
| Dia de Sorte | `dia-de-sorte` |

## Interface

A aplicação principal usa hash routes:

| Área | Rota | Objetivo |
| --- | --- | --- |
| Painel | `/#dashboard` | estado, desempenho e atividade |
| Análises | `/#analysis` | ranking, estrutura, dinâmica, combinações e validação |
| Gerar jogos | `/#generate` | planejamento, preview, geração e persistência |
| Meus jogos | `/#games` | lotes, conferência, comparação e apostas reais |
| Testes históricos | `/#backtests` | execução e histórico de simulações |

Áreas dedicadas:

| Área | Rota | Objetivo |
| --- | --- | --- |
| Laboratório | `/lab` | comparar hipóteses sob condições equivalentes |
| Estratégias | `/strategies` | catálogo e versões imutáveis |
| Execuções | `/jobs` | fila persistente e acompanhamento de trabalhos |
| Agenda | `/agenda` | próximos concursos e notificações |
| IA | `/ai` | interpretar evidências já calculadas |

A direção visual canônica está em [`docs/design/PROTOTYPE_1_DARK_MODERN.md`](docs/design/PROTOTYPE_1_DARK_MODERN.md).

## Arquitetura

```text
Browser
  ↓
web/ + web/src/
  ↓
src/api/                  transporte HTTP
  ↓
src/application/          use cases e ports
  ↓
engines/domínio           analysis, generator, backtest, lab, finance
  ↓
adapters                  PostgreSQL, CAIXA, OpenAI, workers
```

### Análise avançada

`src/analysis/advanced.ts` permanece composition root e delega os blocos matemáticos a owners focados:

- `continuity.ts` — continuidade, gaps e qualidade;
- `statistics.ts` — estatística/combinatória compartilhada;
- `structure.ts` — estrutura e filtros metodológicos;
- `associations.ts` — pares/trincas e inferência;
- `cycles.ts` — ciclos;
- `dynamics.ts` — ranking, dinâmica e robustez;
- `validation.ts` — rolling validation anti-leakage.

A similaridade histórica permanece no compositor porque hoje é composição local do payload, sem boundary ou consumidor independente. Detalhes: [`docs/tasks/ADVANCED_ANALYSIS_DECOMPOSITION_PLAN.md`](docs/tasks/ADVANCED_ANALYSIS_DECOMPOSITION_PLAN.md).

### Frontend

O frontend continua sem framework. `tsconfig.web.json` cobre `web/src/**/*.ts`; `npm run web:build` emite JavaScript para `web-dist/assets/src`.

`web/src/core/featureLoader.ts` é o owner do lazy loading. Boundaries JavaScript já migrados permanecem finos/import-only. A #60 continua focada em reduzir state/lifecycle imperativo e módulos grandes por responsabilidade real, sem rewrite.

Detalhes: [`docs/WEB.md`](docs/WEB.md).

### Persistência e pesquisa

PostgreSQL é a fonte de verdade operacional. O schema versionado vai até `014_research_backtest_evidence.sql`.

- `research_hypotheses` persiste a hipótese humana;
- `research_hypothesis_backtest_evidence` aponta para um `backtest_run` canônico;
- compatibilidade de loteria e lifecycle são defendidos em aplicação e PostgreSQL;
- decisão humana/auditável exige evidência persistida e justificativa;
- não existe `evidence_id` genérico nem cópia paralela do resultado.

Detalhes: [`docs/DATABASE.md`](docs/DATABASE.md) e [`docs/API.md`](docs/API.md).

## Requisitos e desenvolvimento local

- Node.js **24.20.0 LTS**;
- npm;
- Docker + Docker Compose v2;
- Chrome/Chromium somente para E2E local.

```bash
nvm use
npm ci
cp .env.example .env
npm run dev
```

Aplicação local: `http://127.0.0.1:5200`.

Para carregar o histórico completo na primeira execução:

```bash
npm run db:bootstrap
```

Receita completa: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## Banco e dados

Comandos principais:

```bash
npm run db:migrate
npm run db:bootstrap
npm run db:status
npm run db:sync -- mega-sena
npm run db:sync -- lotofacil
npm run db:sync -- dia-de-sorte
npm run ops:sync
```

O dataset JSON é um recurso offline/importável; estado operacional continua no PostgreSQL.

Detalhes: [`docs/DATABASE.md`](docs/DATABASE.md), [`docs/DATA_OPERATIONS.md`](docs/DATA_OPERATIONS.md) e [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

## API

Base local:

```text
http://127.0.0.1:5200/api/v1
```

Famílias principais:

- `/lotteries` e `/contests/...`;
- `/analysis/:lottery` e `/analysis/:lottery/advanced`;
- `/generation/plan`, `/generation/preview`, `/generation/save`;
- `/game-batches/...` e `/games/check`;
- `/backtests/...` e `/backtest-runs/...`;
- `/lab/compare`;
- `/strategies`;
- `/analysis-jobs`;
- `/real-bets`;
- `/operations` e `/data/status`;
- `/agenda` e `/notifications`;
- `/research/hypotheses`, evidências e decisão humana;
- `/ai`.

Detalhes: [`docs/API.md`](docs/API.md).

## Testes e qualidade

Gate obrigatório:

```bash
npm run check
```

Checks adicionais são proporcionais ao risco:

```bash
E2E_BASE_URL=http://127.0.0.1:5200 npm run test:e2e
npm run coverage
npm run audit:prod
```

Não enfraqueça teste, assertion ou E2E para fazer um PR ficar verde.

Detalhes: [`docs/TESTING.md`](docs/TESTING.md) e [`docs/QUALITY.md`](docs/QUALITY.md).

## Produção

```bash
cp .env.production.example .env.production
npm run prod:check
npm run prod:config
npm run prod:backup
npm run prod:deploy
npm run prod:verify
```

Baseline read-only de CPU/memória:

```bash
npm run prod:resources
```

Uma amostra isolada não define limite nem SLO. Tuning exige comparação antes/depois sob carga equivalente.

Detalhes: [`docs/PRODUCTION.md`](docs/PRODUCTION.md), [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), [`docs/RELIABILITY.md`](docs/RELIABILITY.md) e [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md).

## IA opcional

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna
```

Sem chave, somente novas interpretações ficam indisponíveis. Métricas do provider não armazenam prompt, evidência, resposta, credencial ou IDs de alta cardinalidade.

## Metodologia e financeiro

- `score-v2` é o modelo operacional atual;
- backtests e Laboratório usam anti-leakage;
- comparações usam controles reproduzíveis e correção por múltiplas comparações quando aplicável;
- ROI usa preço histórico suportado e rateios oficiais;
- prêmio zero conhecido é diferente de dado financeiro desconhecido;
- aposta real é separada de lote gerado e de simulação histórica.

Leia [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md), [`docs/ANALYSES.md`](docs/ANALYSES.md), [`docs/GENERATION.md`](docs/GENERATION.md), [`docs/STRATEGY_LAB.md`](docs/STRATEGY_LAB.md) e [`docs/FINANCIALS.md`](docs/FINANCIALS.md).

## Fluxo de desenvolvimento

```text
issue → branch curta → implementação + testes → npm run check
→ PR → CI → auto code review no SHA final → squash merge
```

Agentes de IA devem seguir [`AGENTS.md`](AGENTS.md).

## Documentação canônica

- [`AGENTS.md`](AGENTS.md) — invariantes e fluxo de engenharia;
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — prioridades e estado estrutural atual;
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — setup e desenvolvimento;
- [`docs/WEB.md`](docs/WEB.md) — frontend e lifecycle;
- [`docs/API.md`](docs/API.md) — API HTTP;
- [`docs/DATABASE.md`](docs/DATABASE.md) — PostgreSQL e migrations;
- [`docs/ANALYSES.md`](docs/ANALYSES.md) — análise e validação;
- [`docs/GENERATION.md`](docs/GENERATION.md) — geração;
- [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) — metodologia;
- [`docs/STRATEGY_LAB.md`](docs/STRATEGY_LAB.md) — experimentação;
- [`docs/FINANCIALS.md`](docs/FINANCIALS.md) — custos, prêmios e ROI;
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — sync e observabilidade;
- [`docs/PRODUCTION.md`](docs/PRODUCTION.md) — operação em produção;
- [`docs/tasks/README.md`](docs/tasks/README.md) — contratos/planos duráveis por epic.

## Aviso

O Loto Lab é uma ferramenta de pesquisa, organização e auditoria. Não garante prêmio, não prevê sorteios e não altera as probabilidades matemáticas das loterias.
