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
| Frontend | HTML + CSS + ES Modules; source TypeScript incremental, sem framework |
| Backend | Node.js + TypeScript |

## Estado atual

Em 2026-08-31, após o merge do #157:

- a fonte PT-BR e o piso funcional de 16px pertencem aos módulos/estilos canônicos; não existem mais `localization.js`, `readability.js` ou `readability.css` globais;
- o **Protótipo 1 — Dark Moderno / Workspace científico compacto** está aplicado e consolidado nas superfícies principais; a #121 foi concluída;
- Painel, Análises, Gerador, Meus Jogos, Testes históricos, Laboratório, Estratégias, Execuções, Agenda e IA possuem workspaces próprios;
- a consolidação visual #134–#142 removeu/absorveu camadas redundantes com ownership comprovado; folhas funcionais e fallbacks deliberados permaneceram quando possuem responsabilidade real;
- o #143 adicionou auditoria transversal em navegador real para desktop/mobile, texto funcional >=16px, foco por teclado, reduced-motion e ausência de overflow horizontal estrutural;
- o #148 iniciou a modularização TypeScript do frontend com `tsconfig.web.json`, typecheck/lint de `web/src`, emissão via `tsc` para `web-dist/assets/src` e `web/src/shared/formatters.ts` como primeiro helper compartilhado;
- #155–#157 retiraram do monólito HTTP a leitura de concursos, análise básica/avançada e a geração compatível; esses fluxos agora entram por feature controllers/use cases injetados, com composição concreta em `server.ts`;
- `src/api/app.ts` e `LotoLabApiServices` ainda mantêm ownership legado do Generator 2.0 e de parte de game batches/conferência, que seguem sendo reduzidos pela #61;
- CI e Security validam testes, cobertura, PostgreSQL, Compose, imagem, autenticação, navegador real, CodeQL, dependency review, SBOM e vulnerabilidades de container;
- a `main` **ainda não possui branch protection obrigatória**; isso permanece bloqueado na #52 por configuração administrativa do GitHub.

O backlog atualizado está em [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Princípios do produto

1. **Reprodutibilidade.** Seeds, períodos, estratégias, versões, inputs e outputs relevantes devem permitir auditoria e replay quando o fluxo suporta isso.
2. **Anti-leakage.** Ao avaliar um concurso histórico, o algoritmo só enxerga dados anteriores ao alvo.
3. **Sem promessa de previsão.** Frequência, atraso, score, estrutura e evidência histórica não alteram a probabilidade matemática individual de uma combinação válida.
4. **IA fora do cálculo crítico.** IA interpreta evidências; regras matemáticas, geração, conferência, financeiro e testes históricos continuam no código.
5. **UX técnica e legível.** Alta densidade controlada, texto funcional >=16px, foco, teclado, mobile e reduced-motion são guardrails.

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

No mobile, Painel, Análises, Gerar jogos e Meus jogos ficam na navegação principal; os destinos secundários ficam sob **Mais**.

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

A decisão de design foi encerrada na #120. O rollout principal foi entregue em #123–#133 e a consolidação final em #134–#143 encerrou a #121. Evolução arquitetural do frontend segue na #60, jornada/IA na #64 e performance medida na #65.

## Arquitetura

```text
Browser
  │
  ├─ web/                         HTML + CSS + ES Modules
  │   ├─ runtime.js               boundary compatível do runtime atual
  │   └─ src/shared/*.ts          fundação TypeScript incremental (#60)
  │
  ▼
Node HTTP Server
  │
  ├─ feature controllers          src/api/
  │        │
  │        ▼
  ├─ application use cases        src/application/
  │        │
  │        ├─ analysis/generator/backtest/lab/finance
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

A arquitetura está em transição incremental. Concursos, análises e geração compatível já possuem controllers finos e use cases injetados fora do monólito. `src/api/app.ts` ainda concentra o Generator 2.0 e parte de game batches/conferência; `LotoLabApiServices` permanece apenas como facade temporária para responsabilidades remanescentes. A #61 rastreia a remoção desse ownership sem rewrite.

### Frontend

O frontend continua sem framework. A #60 agora possui uma fundação TypeScript real: `tsconfig.web.json` cobre `web/src/**/*.ts`; `typecheck` e `lint` validam essa camada sem emissão, e `npm run web:build` emite JavaScript via `tsc` para `web-dist/assets/src`.

O build também:

- copia os demais assets para `web-dist/`, sem publicar fontes `.ts` cruas;
- calcula fingerprint SHA-256;
- reescreve URLs com `?v=<hash>`;
- mantém HTML sem cache permanente;
- usa lazy loading por feature;
- executa E2E em Chrome/Chromium real.

`web/runtime.js` permanece como boundary compatível para os módulos JavaScript existentes; os formatters compartilhados já vivem em `web/src/shared/formatters.ts` e são reexportados pelo runtime. A migração seguinte deve expandir essa base em fatias pequenas, sem big-bang.

A apresentação segue a cascata `styles.css` → `ui-foundation.css` → `design-system.css` → CSS funcional da feature quando necessário → stylesheet canônico da superfície. Folhas adicionais permanecem apenas quando possuem responsabilidade real; redundância visual não deve voltar a ser mascarada por camadas globais.

### Backend/application layer

Use cases já extraídos incluem catálogo de concursos, análise básica/avançada, geração compatível, conferência, backtest, Strategy Lab, catálogo de estratégias/backtests, operações, apostas reais e status de dados. Concursos, análises e geração compatível já são compostos em `server.ts`; conferência e outros fluxos remanescentes ainda passam pela facade temporária e seguem na #61.

### Persistência

PostgreSQL é a fonte de verdade operacional. Migrations são forward-only, possuem checksum e advisory lock. Repositories concretos ficam em `src/persistence/`.

## Requisitos

- **Node.js 24.19.0 LTS**;
- npm;
- Docker;
- Docker Compose v2;
- Chrome ou Chromium para E2E local.

Com `nvm`:

```bash
nvm use
node --version
```

A versão esperada é `v24.19.0`.

## Quick start local

```bash
git clone https://github.com/felipe-urgal/loto-lab.git
cd loto-lab
npm ci
cp .env.example .env
docker compose up -d postgres
npm run db:migrate
npm run db:bootstrap
npm run api:start
```

Abra:

```text
http://127.0.0.1:5200
```

Portas padrão:

| Serviço | Host | Interno |
| --- | --- | --- |
| App/API local | `127.0.0.1:5200` | processo Node em `5200` |
| PostgreSQL local | `localhost:5434` | `5432` no container |
| App produção | `127.0.0.1:5200` por padrão | `app:3000` |
| PostgreSQL produção | não exposto | `postgres:5432` |

## Banco e dados

Comandos principais:

```bash
npm run db:migrate
npm run db:bootstrap
npm run db:status
npm run db:sync -- mega-sena
npm run db:sync -- lotofacil
npm run db:sync -- dia-de-sorte
```

O bootstrap é idempotente/retomável. A sincronização operacional das três loterias e apostas pendentes usa:

```bash
npm run ops:sync
```

Com `OPS_AUTO_SYNC=true`, o scheduler roda junto da API.

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
- `/ai`.

Detalhes em [`docs/API.md`](docs/API.md).

## Testes e qualidade

Gate local recomendado:

```bash
npm ci
npm run check
npm run audit:prod
```

`npm run check` cobre plataforma, typecheck (backend + `web/src`), higiene de texto, lint, build e testes com thresholds de cobertura.

E2E completo:

```bash
E2E_BASE_URL=http://127.0.0.1:5200 npm run e2e:browser
```

O CI também valida Compose, build/smoke da imagem, autenticação HTTP Basic e browser real. O workflow de Security roda CodeQL, Dependency Review, Trivy e gera SBOM.

## Produção

Prepare:

```bash
cp .env.production.example .env.production
npm run prod:config
npm run prod:up
```

Por padrão a aplicação fica publicada apenas em `127.0.0.1:5200`, adequada para um reverse proxy HTTPS no mesmo host. PostgreSQL não publica porta em produção.

Backup e restore check:

```bash
npm run ops:backup
npm run ops:restore-check -- backups/loto-lab-AAAA-MM-DD.dump
```

Detalhes em [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) e [`docs/RELIABILITY.md`](docs/RELIABILITY.md).

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

## Metodologia e financeiro

- `score-v2` é o modelo operacional atual;
- backtests e Laboratório usam anti-leakage;
- comparações do Laboratório usam controles aleatórios reproduzíveis e correção por múltiplas comparações;
- ROI usa preço histórico suportado e rateios oficiais, distinguindo prêmio zero de dado desconhecido;
- apostas reais são separadas de lotes apenas gerados e de testes históricos.

Leia [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md), [`docs/FINANCIALS.md`](docs/FINANCIALS.md) e [`docs/STRATEGY_LAB.md`](docs/STRATEGY_LAB.md).

## Fluxo de desenvolvimento

- branch por mudança;
- PR pequeno e revisável;
- CI/Security + E2E no SHA final;
- auto code review final antes do merge;
- squash merge;
- não enfraquecer teste/E2E para fazer um PR ficar verde.

**Agentes de IA e automações de desenvolvimento devem ler e seguir [`AGENTS.md`](AGENTS.md) antes de alterar o repositório.** O arquivo formaliza postura Fullstack Sênior, fila de PRs, investigação de gates, padrões frontend/backend/banco e o auto code review final obrigatório no SHA verde.

A proteção obrigatória da `main` ainda precisa ser configurada administrativamente (#52).

## Mapa da documentação

| Documento | Assunto |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | contrato operacional para agentes de IA e fluxo de PR/review |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | prioridades e issues ativas |
| [`docs/MENTAL_MODEL.md`](docs/MENTAL_MODEL.md) | mapa conceitual e arquitetural |
| [`docs/WEB.md`](docs/WEB.md) | frontend, navegação e lifecycle |
| [`docs/API.md`](docs/API.md) | API HTTP |
| [`docs/DATABASE.md`](docs/DATABASE.md) | PostgreSQL, migrations e repositories |
| [`docs/DATA_OPERATIONS.md`](docs/DATA_OPERATIONS.md) | bootstrap e manutenção do histórico |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | scheduler e sync operacional |
| [`docs/RELIABILITY.md`](docs/RELIABILITY.md) | hardening e guardrails |
| [`docs/QUALITY.md`](docs/QUALITY.md) | CI, cobertura e supply chain |
| [`docs/PLATFORM.md`](docs/PLATFORM.md) | baseline Node/TypeScript |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | produção e restore |
| [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) | build, workers e profiling |
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

## Aviso

O Loto Lab é uma ferramenta de pesquisa, organização e auditoria de estratégias. Não garante prêmio, não prevê sorteios e não altera as probabilidades matemáticas das loterias.
