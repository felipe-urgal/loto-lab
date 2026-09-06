# Loto Lab

Motor auditável de análise, geração, conferência, testes históricos e experimentação para **Mega-Sena**, **Lotofácil** e **Dia de Sorte**.

> **Algoritmo calcula; IA interpreta.**

O Loto Lab organiza hipóteses, estratégias e jogos de forma reproduzível. Frequências, pontuações, classificações, geração, conferência, custos, premiações, testes históricos e comparações são calculados por código. A integração opcional com IA recebe evidências já calculadas e produz interpretação; ela não escolhe dezenas nem substitui o core estatístico.

| Baseline | Valor |
| --- | --- |
| Versão | `0.6.0` |
| Runtime | Node.js 24.19.0 LTS / linha 24.x |
| TypeScript | 7.x |
| Persistência | PostgreSQL 16 |
| Frontend | HTML + CSS + ES Modules; owners TypeScript incrementais, sem framework |
| Backend | Node.js + TypeScript |

## Estado atual

Baseline reconciliada em **2026-09-06**, com a `main` até #240:

- PostgreSQL é a fonte de verdade operacional, com migrations forward-only, checksum e advisory lock;
- `src/api/server.ts` é o composition root das features HTTP; controllers delegam regra de negócio a application use cases;
- o frontend continua vanilla, mas as principais superfícies e primitives já possuem ownership TypeScript em `web/src`; boundaries JavaScript migrados ficam finos/import-only;
- o Protótipo 1 — Dark Moderno está consolidado nas superfícies principais, com piso funcional de 16px, foco/teclado, reduced-motion e mobile como guardrails;
- análises, geração, backtests, Strategy Lab e financeiro preservam reprodutibilidade, anti-leakage e distinção entre dado desconhecido e zero conhecido;
- a jornada científica já possui raiz persistida em `research_hypotheses` e pode associar um `backtest_run` como primeira evidência canônica; a decisão humana ainda não é exposta pela API;
- observabilidade operacional cobre HTTP, Analysis Jobs, sync, pool PostgreSQL, CAIXA e OpenAI;
- produção possui `prod:resources`, snapshot read-only de CPU/memória para comparar baseline antes/depois de tuning;
- `npm run check` é o gate funcional canônico; E2E, coverage, audit e Security são direcionados por risco;
- a `main` ainda não possui branch protection obrigatória; isso permanece como configuração administrativa da #52.

Prioridade e dependências atuais: [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Princípios do produto

1. **Reprodutibilidade.** Seeds, períodos, estratégias, versões, inputs e outputs relevantes devem permitir auditoria e replay quando o fluxo suporta isso.
2. **Anti-leakage.** Ao avaliar um concurso histórico, o algoritmo só enxerga dados anteriores ao alvo.
3. **Sem promessa de previsão.** Frequência, atraso, score, estrutura e evidência histórica não alteram a probabilidade matemática individual de uma combinação válida.
4. **IA fora do cálculo crítico.** IA interpreta evidências; regras matemáticas, geração, conferência, financeiro e testes históricos continuam no código.
5. **Proveniência explícita.** Hipótese, execução e evidência reutilizam IDs/owners canônicos; o sistema evita snapshots opacos e identidades paralelas quando existe FK real.
6. **UX técnica e legível.** Alta densidade controlada, texto funcional >=16px, foco, teclado, mobile e reduced-motion são guardrails.
7. **Performance baseada em evidência.** Não se escolhe índice, concorrência, cache, timeout ou limite de recurso sem baseline comparável.

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
| Análises | `/#analysis` | pontuação, classificação, estrutura e validação |
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

No mobile, os destinos secundários ficam sob **Mais** quando necessário.

## Direção visual

A referência oficial está em [`docs/design/PROTOTYPE_1_DARK_MODERN.md`](docs/design/PROTOTYPE_1_DARK_MODERN.md).

Regras principais:

- fundo azul-preto e superfícies azul-grafite;
- azul para ação, seleção e informação primária;
- verde somente para sucesso/resultado positivo;
- âmbar/vermelho para atenção/erro real;
- sem gradiente decorativo ou glow excessivo;
- tipografia funcional mínima de 16px;
- sidebar no desktop e navegação própria no mobile;
- tabelas, filtros e métricas compactos sem sacrificar legibilidade;
- gráficos apenas quando existe dado real que justifique a visualização.

## Arquitetura

```text
Browser
  │
  ├─ web/                         HTML + CSS + boundaries JS finos
  │   └─ src/
  │       ├─ core/                API, loader, lifecycle, contexto
  │       ├─ features/            owners funcionais das superfícies
  │       └─ shared/              escaping, formatters, toast etc.
  │
  ▼
Node HTTP Server
  │
  ├─ feature controllers          src/api/
  │        │
  │        ▼
  ├─ application use cases        src/application/
  │        │
  │        ├─ analysis/generator/backtest/lab/finance/research
  │        └─ ports/interfaces
  │
  ├─ adapters/repositories        src/persistence/, src/data/, src/ai/
  │        │
  │        ├─ PostgreSQL
  │        ├─ CAIXA
  │        └─ OpenAI opcional
  │
  └─ workers/scheduler/observability
```

### Frontend

O frontend continua sem framework. `tsconfig.web.json` cobre `web/src/**/*.ts`; `typecheck` e `lint` validam essa camada, e `npm run web:build` emite JavaScript para `web-dist/assets/src`.

`web/src/core/featureLoader.ts` é o owner canônico do lazy loading. `web/feature-loader.js` e outros boundaries já migrados permanecem import-only para compatibilidade com assets/HTML existentes.

Owners TypeScript já existem para primitives compartilhadas e para as principais features, incluindo Painel/status, Agenda, IA, Estratégias, Execuções, Laboratório, Meus Jogos, Análises, Gerador e Testes históricos. A evolução da #60 continua incremental: reduzir state/lifecycle imperativo e decompor módulos grandes sem rewrite de framework.

Detalhes: [`docs/WEB.md`](docs/WEB.md).

### Backend/application layer

Use cases cobrem catálogo de concursos, análise básica/avançada, geração compatível/Generator 2.0, game batches/conferência/comparação, backtests, Strategy Lab, estratégias, operações, apostas reais, status de dados, Agenda/notificações, IA, Analysis Jobs e pesquisa/proveniência.

`src/api/server.ts` compõe dependências concretas das features HTTP. `src/cli/apiStart.ts` permanece dono do lifecycle de processo: start/recovery/drain da fila, scheduler e runtime lock.

A decomposição algorítmica restante pertence à #62 e deve avançar sem reabrir a fronteira HTTP consolidada.

### Persistência e pesquisa

PostgreSQL é a fonte de verdade operacional. Migrations são forward-only, possuem checksum e advisory lock.

O schema atual vai até `014_research_backtest_evidence.sql`:

- `research_hypotheses` persiste a hipótese humana;
- `research_hypothesis_backtest_evidence` liga diretamente a hipótese a um `backtest_run` canônico;
- lifecycle e compatibilidade de loteria são defendidos no use case e no PostgreSQL;
- não existe `evidence_id` genérico nem cópia do resultado para a hipótese;
- decisão humana continua fora da API até existir contrato auditável explícito.

Detalhes: [`docs/DATABASE.md`](docs/DATABASE.md) e [`docs/API.md`](docs/API.md).

## Requisitos

- **Node.js 24.19.0 LTS**;
- npm;
- Docker;
- Docker Compose v2;
- Chrome ou Chromium somente para E2E local.

Com `nvm`:

```bash
nvm use
node --version
```

A versão esperada é `v24.19.0`.

## Desenvolvimento local

A receita canônica está em [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

Quickstart:

```bash
npm ci
cp .env.example .env
npm run dev
```

Abra:

```text
http://127.0.0.1:5200
```

Para carregar o histórico completo na primeira execução, em outro terminal:

```bash
npm run db:bootstrap
```

Portas padrão:

| Serviço | Host | Interno |
| --- | --- | --- |
| App/API local | `127.0.0.1:5200` | processo Node em `5200` |
| PostgreSQL local | `localhost:5434` | `5432` no container |
| App produção | `127.0.0.1:5200` por padrão | `app:3000` |
| PostgreSQL produção | não exposto | `postgres:5432` |

## Banco, dataset e dados

PostgreSQL é a fonte de verdade operacional.

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

O dataset JSON offline usa namespace próprio:

```bash
npm run dataset:sync -- mega-sena
npm run dataset:refresh -- mega-sena 1 100
npm run db:import-dataset -- data/contests.json
```

Detalhes: [`docs/DATABASE.md`](docs/DATABASE.md), [`docs/DATA_OPERATIONS.md`](docs/DATA_OPERATIONS.md) e [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

## API

Base local:

```text
http://127.0.0.1:5200/api/v1
```

Principais famílias:

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
- `/research/hypotheses` e evidência de backtests;
- `/ai`.

Detalhes: [`docs/API.md`](docs/API.md).

## Testes e qualidade

Gate obrigatório antes do PR:

```bash
npm run check
```

`npm run check` cobre contrato de produção versionado, formatação, baseline de plataforma/TypeScript, build e testes funcionais.

Checks direcionados:

```bash
E2E_BASE_URL=http://127.0.0.1:5200 npm run test:e2e
npm run coverage
npm run audit:prod
```

Coverage e E2E não são custo fixo de todo PR. O workflow de Security é semanal/manual e executa audit, CodeQL, SBOM e Trivy.

Detalhes: [`docs/TESTING.md`](docs/TESTING.md) e [`docs/QUALITY.md`](docs/QUALITY.md).

## Produção

A receita canônica está em [`docs/PRODUCTION.md`](docs/PRODUCTION.md).

Fluxo resumido:

```bash
cp .env.production.example .env.production
npm run prod:check
npm run prod:config
npm run prod:backup
npm run prod:deploy
npm run prod:verify
```

Diagnóstico read-only de CPU/memória:

```bash
npm run prod:resources
```

Uma amostra isolada não define limite nem SLO. Tuning exige comparação antes/depois sob carga equivalente.

Por padrão a aplicação fica publicada somente em `127.0.0.1:5200`, adequada para reverse proxy HTTPS no mesmo host. PostgreSQL não publica porta em produção.

Restore check:

```bash
npm run prod:restore-check -- backups/loto-lab-AAAA-MM-DD.dump
```

Detalhes: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), [`docs/RELIABILITY.md`](docs/RELIABILITY.md), [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) e [`docs/PRODUCTION-CONTRACT.md`](docs/PRODUCTION-CONTRACT.md).

## Segurança operacional

- bind não-loopback exige autenticação;
- sem exceção explícita, exposição não-loopback exige `PUBLIC_ORIGIN=https://...`;
- mutações possuem proteção same-origin;
- corpos HTTP exigem JSON quando aplicável;
- cada resposta recebe `X-Request-Id`;
- container de produção roda não-root/read-only e com capabilities reduzidas;
- migrations aplicadas são imutáveis por checksum;
- uma instância ativa por banco é protegida por advisory lock.

## IA opcional

Configure no backend:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna
```

Sem chave, somente a geração de novas interpretações fica indisponível. O restante do produto funciona normalmente.

Métricas da OpenAI registram outcomes/latência e uso de tokens quando conhecido, sem armazenar prompt, evidência, texto da resposta, credencial ou IDs de alta cardinalidade.

## Metodologia e financeiro

- `score-v2` é o modelo operacional atual;
- backtests e Laboratório usam anti-leakage;
- comparações do Laboratório usam controles aleatórios reproduzíveis e correção por múltiplas comparações;
- ROI usa preço histórico suportado e rateios oficiais, distinguindo prêmio zero de dado desconhecido;
- apostas reais são separadas de lotes apenas gerados e de testes históricos.

Leia [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md), [`docs/FINANCIALS.md`](docs/FINANCIALS.md) e [`docs/STRATEGY_LAB.md`](docs/STRATEGY_LAB.md).

## Fluxo de desenvolvimento

```text
issue
-> branch curta
-> implementação + testes
-> npm run dev
-> npm run check
-> test:e2e quando o risco justificar
-> PR
-> CI funcional + Security quando aplicável
-> auto code review no SHA final
-> squash merge
```

Não enfraqueça teste/E2E para fazer um PR ficar verde.

**Agentes de IA e automações de desenvolvimento devem ler e seguir [`AGENTS.md`](AGENTS.md) antes de alterar o repositório.**

## Mapa da documentação

| Documento | Assunto |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | contrato operacional para agentes de IA e fluxo de PR/review |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | setup, execução local e gate antes do PR |
| [`docs/PRODUCTION.md`](docs/PRODUCTION.md) | preflight, backup, deploy, verify e baseline de recursos |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | prioridades e issues ativas |
| [`docs/MENTAL_MODEL.md`](docs/MENTAL_MODEL.md) | mapa conceitual e arquitetural |
| [`docs/WEB.md`](docs/WEB.md) | frontend, navegação e lifecycle |
| [`docs/API.md`](docs/API.md) | API HTTP, incluindo pesquisa/proveniência |
| [`docs/DATABASE.md`](docs/DATABASE.md) | PostgreSQL, migrations, repositories e pesquisa |
| [`docs/DATA_OPERATIONS.md`](docs/DATA_OPERATIONS.md) | bootstrap e manutenção do histórico |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | scheduler, sync e observabilidade operacional |
| [`docs/RELIABILITY.md`](docs/RELIABILITY.md) | hardening e guardrails |
| [`docs/TESTING.md`](docs/TESTING.md) | testes funcionais, coverage e E2E |
| [`docs/QUALITY.md`](docs/QUALITY.md) | CI, gates e supply chain |
| [`docs/PLATFORM.md`](docs/PLATFORM.md) | baseline Node/TypeScript |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | topologia e detalhes de produção |
| [`docs/PRODUCTION-CONTRACT.md`](docs/PRODUCTION-CONTRACT.md) | contrato consumido pelo Dev Dashboard |
| [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) | build, workers, profiling e medição antes de tuning |
| [`docs/ANALYSES.md`](docs/ANALYSES.md) | Análises 2.0 |
| [`docs/GENERATION.md`](docs/GENERATION.md) | geração e score-v2 |
| [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) | regras funcionais da metodologia |
| [`docs/STRATEGY_LAB.md`](docs/STRATEGY_LAB.md) | experimentos e evidência |
| [`docs/FINANCIALS.md`](docs/FINANCIALS.md) | custos, prêmios e ROI |
| [`docs/MY_GAMES.md`](docs/MY_GAMES.md) | gestão de lotes |
| [`docs/REAL_BETS.md`](docs/REAL_BETS.md) | apostas reais e auditabilidade |
| [`docs/AGENDA.md`](docs/AGENDA.md) | agenda/notificações |
| [`docs/AI.md`](docs/AI.md) | IA interpretativa |
| [`docs/LOTOFACIL_READINESS.md`](docs/LOTOFACIL_READINESS.md) | checklist operacional da Lotofácil |
| [`docs/tasks/README.md`](docs/tasks/README.md) | índice de registros históricos por epic; não é backlog paralelo |

## Aviso

O Loto Lab é uma ferramenta de pesquisa, organização e auditoria de estratégias. Não garante prêmio, não prevê sorteios e não altera as probabilidades matemáticas das loterias.
