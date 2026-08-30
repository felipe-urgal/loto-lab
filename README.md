# Loto Lab

Motor de análise, geração, conferência, testes históricos e laboratório de estratégias para **Mega-Sena**, **Lotofácil** e **Dia de Sorte**.

> **Algoritmo calcula; IA interpreta.**

O Loto Lab foi construído para organizar experimentos, comparar estratégias e acompanhar jogos de forma **auditável e reproduzível**. Frequências, pontuações, classificações, geração, conferência, custos, premiações, testes históricos e comparações são calculados por código. A integração opcional com IA recebe evidências já calculadas para explicar resultados e sugerir hipóteses; ela não escolhe dezenas no lugar do algoritmo e não substitui o core estatístico.

**Versão atual:** `0.6.0`  
**Runtime:** Node.js `24.19.0` / linha 24.x  
**Persistência:** PostgreSQL 16  
**Frontend:** HTML + CSS + ES Modules, sem framework  
**Backend:** Node.js + TypeScript  

---

## Índice

- [O que o projeto faz](#o-que-o-projeto-faz)
- [Princípios do produto](#princípios-do-produto)
- [Loterias suportadas](#loterias-suportadas)
- [Interface e áreas do produto](#interface-e-áreas-do-produto)
- [Direção visual e redesign](#direção-visual-e-redesign)
- [Arquitetura](#arquitetura)
- [Requisitos](#requisitos)
- [Portas padrão](#portas-padrão)
- [Quick start local](#quick-start-local)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Banco de dados](#banco-de-dados)
- [Rodar a aplicação](#rodar-a-aplicação)
- [Health checks](#health-checks)
- [Operação e sincronização](#operação-e-sincronização)
- [API HTTP](#api-http)
- [CLI](#cli)
- [Testes e qualidade](#testes-e-qualidade)
- [E2E em navegador real](#e2e-em-navegador-real)
- [CI e Security](#ci-e-security)
- [Produção com Docker Compose](#produção-com-docker-compose)
- [Backup e restore check](#backup-e-restore-check)
- [Segurança](#segurança)
- [IA opcional](#ia-opcional)
- [Métricas financeiras](#métricas-financeiras)
- [Regra anti-leakage](#regra-anti-leakage)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Fluxo de desenvolvimento e PR](#fluxo-de-desenvolvimento-e-pr)
- [Troubleshooting](#troubleshooting)
- [Documentação detalhada](#documentação-detalhada)
- [Aviso](#aviso)

---

## O que o projeto faz

O Loto Lab combina em uma única aplicação:

- sincronização incremental e bootstrap histórico com dados oficiais da CAIXA;
- persistência PostgreSQL para concursos, lotes, apostas reais, estratégias, execuções e testes históricos;
- análise básica e workspace avançado de **Análises 2.0**;
- classificação e pontuação auditáveis por horizonte;
- geração determinística e geração diversificada com **seed auditável**;
- planejamento, preview e persistência do Gerador 2.0;
- conferência de lotes contra concursos reais;
- registro separado de apostas efetivamente realizadas;
- acompanhamento financeiro de gasto, prêmio, resultado líquido e ROI;
- testes históricos com proteção contra vazamento de informação futura;
- Laboratório de Estratégias para comparação controlada de hipóteses;
- catálogo/versionamento de estratégias;
- trabalhos pesados fora do fluxo principal quando aplicável;
- fila persistente para análises e execuções;
- scheduler operacional para manter concursos e apostas pendentes atualizados;
- Agenda, Execuções e status operacional;
- interpretação opcional de evidências por IA;
- frontend e API servidos pelo mesmo processo HTTP;
- stack Docker de produção com PostgreSQL não exposto diretamente no host.

O roadmap geral de engenharia e produto está em [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Princípios do produto

### 1. Reprodutibilidade

Uma execução relevante deve poder ser explicada posteriormente. Seeds, períodos, estratégia, parâmetros, resultados e artefatos persistidos existem para permitir auditoria e replay quando o fluxo suporta isso.

### 2. Sem promessa de previsão

O sistema mede comportamento histórico e organiza estratégias. Ele **não afirma prever sorteios futuros** e não trata frequência passada como garantia de ocorrência futura.

### 3. Anti-leakage

Ao avaliar um concurso histórico, o algoritmo só pode enxergar dados anteriores ao alvo. Essa regra é obrigatória para testes históricos, validações fora da amostra e experimentos do Laboratório.

### 4. IA fora do cálculo crítico

A IA interpreta evidências produzidas pelo sistema. Regras matemáticas, geração, conferência, métricas financeiras e testes históricos continuam determinísticos/auditáveis no core.

### 5. UX técnica, compacta e legível

A interface é orientada a análise e operação prolongada: alta densidade controlada, tipografia funcional mínima de 16px, contraste, teclado, mobile e hierarquia clara entre estado, ação e evidência.

---

## Loterias suportadas

| Produto | Identificador técnico |
| --- | --- |
| Mega-Sena | `mega-sena` |
| Lotofácil | `lotofacil` |
| Dia de Sorte | `dia-de-sorte` |

Os identificadores acima aparecem em API, CLI, banco e alguns contratos internos. A interface usa nomes amigáveis em PT-BR.

---

## Interface e áreas do produto

A aplicação principal usa navegação por hash:

| Área | Rota local | Objetivo |
| --- | --- | --- |
| Painel | `/#dashboard` | Estado atual, concursos, desempenho e atividade |
| Análises | `/#analysis` | Pontuação, classificação, estrutura, dinâmica e validação |
| Gerar jogos | `/#generate` | Planejamento, seleção, preview e persistência |
| Meus jogos | `/#games` | Lotes, comparação, conferência e apostas reais |
| Testes históricos | `/#backtests` | Execução e leitura de testes históricos |

Áreas dedicadas:

| Área | Rota | Objetivo |
| --- | --- | --- |
| Laboratório | `/lab` | Comparação controlada de hipóteses e estratégias |
| Estratégias | `/strategies` | Catálogo e versões de estratégias |
| Execuções | `/jobs` | Trabalhos persistidos e acompanhamento operacional |
| Agenda | `/agenda` | Agenda e informações operacionais |
| IA | `/ai` | Interpretação opcional das evidências calculadas |

### Painel

O Painel resume informação real disponível no sistema. No modo de uma loteria ele prioriza concurso atual, jogos recentes, ROI histórico, resultado real, estado de conferência e atividade. No modo **Todas as loterias**, métricas financeiras agregadas são calculadas a partir de custo/resultado total, evitando médias incorretas de percentuais.

### Análises

Análises 2.0 organiza frequências, pontuação, classificação, combinações, comportamento temporal e validações. Termos técnicos internos como `score` e `ranking` podem continuar presentes em contratos de código/API por compatibilidade; a copy de produto usa **pontuação** e **classificação**.

### Gerador

O Gerador separa planejamento, preview e persistência. Geração diversificada produz seed auditável; persistir uma prévia diversificada deve reutilizar a seed retornada pelo próprio fluxo para garantir consistência.

### Meus Jogos e Apostas Reais

Lotes gerados não são tratados automaticamente como apostas. Apostas reais são registradas explicitamente, com concurso, jogos efetivamente apostados e custo real. O resultado é reconciliado quando o concurso correspondente está disponível.

### Testes históricos e Laboratório

Testes históricos medem uma estratégia em períodos passados sob regra anti-leakage. O Laboratório compara variantes sob condições equivalentes para evitar conclusões baseadas em períodos ou quantidades de jogos incompatíveis.

---

## Direção visual e redesign

O redesign oficial do Loto Lab segue o **Protótipo 1 — Dark Moderno / Workspace científico compacto**.

![Protótipo 1 — Dark Moderno](docs/design/prototype-1-dark-workspace.svg)

A referência detalhada está em [`docs/design/PROTOTYPE_1_DARK_MODERN.md`](docs/design/PROTOTYPE_1_DARK_MODERN.md).

Decisões principais:

- fundo azul-preto muito escuro;
- superfícies azul-grafite;
- **azul** reservado para ação, seleção e informação primária;
- **verde** reservado para sucesso/estado positivo;
- âmbar e vermelho apenas para atenção/erro real;
- sem gradientes decorativos ou glow excessivo;
- radius e elevation discretos;
- tipografia funcional mínima de 16px;
- sidebar persistente no desktop;
- navegação responsiva apropriada no mobile;
- tabelas e controles compactos sem sacrificar legibilidade;
- gráficos apenas quando existe dado real que justifique a visualização;
- nada de gráficos ou métricas fictícias apenas para preencher layout.

### Estado do rollout visual

A fundação visual, shell/navegação e Painel seguem a direção aprovada. As demais superfícies são migradas incrementalmente para evitar um big-bang visual e permitir revisão/E2E por feature.

O plano de redesign está registrado nas issues:

- [#120 — direção-mãe do redesign](https://github.com/felipe-urgal/loto-lab/issues/120);
- [#121 — roadmap de implementação visual](https://github.com/felipe-urgal/loto-lab/issues/121).

Ordem planejada:

1. Foundations / Design System;
2. shell e navegação;
3. Painel;
4. Análises;
5. Gerador;
6. Meus Jogos / Apostas Reais;
7. Testes históricos / Laboratório / Estratégias;
8. Execuções / Agenda / Operações / IA;
9. consolidação e remoção do legado visual restante.

---

## Arquitetura

Visão simplificada:

```text
Browser
  │
  ├─ web/ (HTML + CSS + ES Modules)
  │
  ▼
Node HTTP Server
  │
  ├─ controllers / feature routes        src/api/
  │        │
  │        ▼
  ├─ application use cases               src/application/
  │        │
  │        ├─ domain/statistical engines src/analysis, generator, backtest, lab...
  │        └─ ports/interfaces
  │
  ├─ adapters / repositories             src/persistence/, src/data/, src/ai/
  │        │
  │        ├─ PostgreSQL
  │        ├─ fonte oficial CAIXA
  │        └─ OpenAI opcional
  │
  └─ workers / scheduler / observability
```

### Frontend

O frontend não usa framework. Ele é composto por:

- HTML estático por superfície;
- CSS base + Design System + folhas específicas de feature;
- ES Modules carregados diretamente;
- `feature-loader.js` para módulos específicos da aplicação principal;
- build web com fingerprint dos assets;
- E2E em Chrome/Chromium real via Chrome DevTools Protocol.

Não existem mais camadas globais de correção em runtime como `localization.js`, `readability.js` ou `readability.css`. A copy PT-BR e a legibilidade devem nascer na fonte canônica da própria feature.

### Backend

A arquitetura está sendo consolidada para controllers HTTP finos e **application use cases** independentes do transporte. Entre os fluxos já isolados estão:

- análise básica;
- análise avançada;
- geração;
- conferência de lote;
- catálogo e execução de testes históricos;
- catálogo e execução do Strategy Lab;
- catálogo de estratégias;
- status de dados;
- operações/sincronização;
- apostas reais.

O composition root fica no servidor HTTP, onde repositories e adapters concretos são conectados às portas do application layer.

### Trabalhos pesados

Análises e execuções pesadas podem usar workers e um gate compartilhado para proteger CPU/memória. O objetivo é impedir que tarefas caras bloqueiem o event loop ou sejam iniciadas em paralelo sem controle.

### Persistência

PostgreSQL é a persistência principal. Migrations ficam em `db/migrations/`. Repositories concretos ficam em `src/persistence/` e não devem vazar como dependência para regras puras do domínio/application layer quando uma porta menor é suficiente.

---

## Requisitos

Obrigatórios:

- **Node.js 24.19.0**, linha `24.x` (`.nvmrc` e `package.json`);
- npm;
- Docker;
- Docker Compose v2.

Para E2E local:

- Google Chrome ou Chromium disponível como `google-chrome`, `google-chrome-stable`, `chromium` ou `chromium-browser`;
- alternativamente, `CHROME_PATH` apontando para o executável.

Se usar `nvm`:

```bash
nvm use
node --version
```

A versão esperada é `v24.19.0`.

---

## Portas padrão

| Serviço | Host local | Dentro do container/serviço |
| --- | --- | --- |
| Aplicação + API local | `127.0.0.1:5200` | processo Node em `5200` |
| PostgreSQL local | `localhost:5434` | PostgreSQL em `5432` |
| Aplicação em produção | `127.0.0.1:5200` por padrão | app em `3000` |
| PostgreSQL em produção | **não exposto no host** | `postgres:5432` na rede Docker |

O desenvolvimento usa `5434` no host de propósito para não disputar a porta PostgreSQL padrão `5432` da máquina.

---

## Quick start local

### 1. Instalar dependências

```bash
git clone https://github.com/felipe-urgal/loto-lab.git
cd loto-lab
npm ci
```

### 2. Criar o ambiente local

```bash
cp .env.example .env
```

### 3. Subir PostgreSQL

```bash
docker compose up -d postgres
```

Confira o container:

```bash
docker compose ps
```

### 4. Aplicar migrations

```bash
npm run db:migrate
```

### 5. Carregar histórico

Para uma instalação nova:

```bash
npm run db:bootstrap
npm run db:status
```

O bootstrap é idempotente e retomável: concursos já persistidos são pulados e lacunas podem ser retomadas.

### 6. Rodar a aplicação

```bash
npm run api:start
```

Abra:

```text
http://127.0.0.1:5200
```

Valide readiness:

```bash
curl -f http://127.0.0.1:5200/health/ready
```

---

## Variáveis de ambiente

### Desenvolvimento local

O `.env.example` atual contém:

```env
DATABASE_URL=postgresql://loto_lab:loto_lab@localhost:5434/loto_lab
API_HOST=127.0.0.1
API_PORT=5200
OPS_AUTO_SYNC=true
OPS_INTERVAL_MINUTES=30
OPS_STALE_AFTER_MINUTES=180
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna
```

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `DATABASE_URL` | sim | conexão PostgreSQL local |
| `API_HOST` | sim/recomendada | endereço de bind do servidor |
| `API_PORT` | sim/recomendada | porta HTTP local |
| `API_CORS_ORIGIN` | não | origin explícito quando frontend/API são separados |
| `PUBLIC_ORIGIN` | não no local | origem pública conhecida; também usada na proteção de mutações |
| `OPS_AUTO_SYNC` | não | habilita scheduler operacional |
| `OPS_INTERVAL_MINUTES` | não | intervalo entre verificações automáticas |
| `OPS_STALE_AFTER_MINUTES` | não | limite usado para considerar dados desatualizados |
| `OPENAI_API_KEY` | não | habilita integração de IA |
| `OPENAI_MODEL` | não | modelo usado pelo adapter de IA |

Em desenvolvimento local, normalmente **não defina** `API_CORS_ORIGIN` ou `PUBLIC_ORIGIN`. O servidor deriva a origem do próprio `Host`, permitindo uso por `localhost` ou `127.0.0.1` sem fixar uma porta de frontend separada.

### Produção

`.env.production.example` adiciona:

| Variável | Uso |
| --- | --- |
| `APP_BIND` | endereço publicado no host; padrão `127.0.0.1` |
| `APP_PORT` | porta publicada; padrão `5200` |
| `PUBLIC_ORIGIN` | URL pública correta da aplicação |
| `ALLOW_INSECURE_PUBLIC_HTTP` | exceção emergencial; não usar em rede não confiável |
| `LOTO_LAB_IMAGE_TAG` | tag da imagem Docker |
| `APP_AUTH_USER` | usuário HTTP Basic obrigatório em produção |
| `APP_AUTH_PASSWORD` | senha HTTP Basic obrigatória em produção |
| `POSTGRES_DB` | nome da base |
| `POSTGRES_USER` | usuário PostgreSQL |
| `POSTGRES_PASSWORD` | senha PostgreSQL obrigatória |
| `OPS_SHUTDOWN_TIMEOUT_SECONDS` | tempo de encerramento operacional gracioso |

Nunca versione `.env` ou `.env.production` com credenciais reais.

---

## Banco de dados

### Subir apenas o PostgreSQL local

```bash
docker compose up -d postgres
```

### Parar os serviços locais

```bash
docker compose down
```

O volume `loto_lab_postgres` é persistente; `docker compose down` não apaga os dados por padrão.

### Migrations

```bash
npm run db:migrate
```

`npm run api:start` também aplica migrations pendentes durante a inicialização.

### Bootstrap histórico

Todas as loterias:

```bash
npm run db:bootstrap
```

Uma loteria:

```bash
npm run db:bootstrap -- mega-sena
npm run db:bootstrap -- lotofacil
npm run db:bootstrap -- dia-de-sorte
```

### Sincronização de uma loteria

```bash
npm run db:sync -- mega-sena
npm run db:sync -- lotofacil
npm run db:sync -- dia-de-sorte
```

### Status da base

```bash
npm run db:status
```

### Importar JSON existente

```bash
npm run db:import-json -- <arquivo-ou-argumentos-do-fluxo>
```

Consulte [`docs/DATABASE.md`](docs/DATABASE.md) e [`docs/DATA_OPERATIONS.md`](docs/DATA_OPERATIONS.md) antes de operar importações ou manutenção em uma base importante.

---

## Rodar a aplicação

```bash
npm run api:start
```

Esse comando:

1. executa o build do backend e frontend;
2. carrega `.env` quando existir;
3. aplica migrations pendentes;
4. inicia o servidor HTTP;
5. serve frontend e API no mesmo origin;
6. inicia o scheduler quando `OPS_AUTO_SYNC=true`.

URLs padrão:

```text
Aplicação:   http://127.0.0.1:5200
API:         http://127.0.0.1:5200/api/v1
Health live: http://127.0.0.1:5200/health/live
Health ready:http://127.0.0.1:5200/health/ready
Laboratório: http://127.0.0.1:5200/lab
```

---

## Health checks

### Liveness

```http
GET /health/live
```

Retorna `200` quando o processo HTTP está respondendo. Não consulta PostgreSQL.

Exemplo:

```bash
curl -f http://127.0.0.1:5200/health/live
```

### Readiness

```http
GET /health/ready
```

Executa uma consulta simples no banco (`SELECT 1`). É o endpoint apropriado para verificar se a aplicação está pronta para atender fluxos dependentes de persistência.

```bash
curl -f http://127.0.0.1:5200/health/ready
```

`/health` funciona como alias de readiness.

Health checks não exigem HTTP Basic na stack protegida de produção.

---

## Operação e sincronização

### Sincronização operacional completa

```bash
npm run ops:sync
```

Esse fluxo trabalha as três loterias e também pode reconciliar apostas reais pendentes quando o concurso correspondente passa a estar disponível.

### Scheduler

Quando `OPS_AUTO_SYNC=true`, o servidor executa a rotina operacional em intervalos definidos por `OPS_INTERVAL_MINUTES`.

O scheduler e a sincronização manual compartilham proteção contra execução concorrente. Uma segunda sincronização não deve iniciar trabalho duplicado enquanto outra já estiver em andamento.

### Endpoints operacionais

```http
GET  /api/v1/operations/status
POST /api/v1/operations/sync
GET  /api/v1/data/status
```

Detalhes em [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

---

## API HTTP

Base local:

```text
http://127.0.0.1:5200/api/v1
```

A documentação completa de payloads e comportamento está em [`docs/API.md`](docs/API.md).

### Loterias e concursos

```http
GET /api/v1/lotteries
GET /api/v1/contests/:lottery
GET /api/v1/contests/:lottery/latest
GET /api/v1/contests/:lottery/:contestNumber
```

Listagens de concursos aceitam, conforme o endpoint:

- `limit` de 1 a 200;
- `order=asc|desc`;
- `startContest`;
- `endContest`.

### Análises

```http
GET /api/v1/analysis/:lottery
GET /api/v1/analysis/:lottery/advanced
```

### Gerador 2.0

```http
POST /api/v1/generation/plan
POST /api/v1/generation/preview
POST /api/v1/generation/save
```

Compatibilidade legada:

```http
POST /api/v1/games/generate
```

### Lotes, conferência e comparação

```http
GET  /api/v1/game-batches/:lottery
GET  /api/v1/game-batches/id/:id
GET  /api/v1/game-batches/:id/comparison
POST /api/v1/games/check
```

### Estratégias

```http
GET  /api/v1/strategies
POST /api/v1/strategies
```

### Testes históricos

```http
POST /api/v1/backtests/run
GET  /api/v1/backtests/:lottery
GET  /api/v1/backtest-runs/:id
```

### Laboratório

```http
POST /api/v1/lab/compare
```

### Operação

```http
GET  /api/v1/data/status
GET  /api/v1/operations/status
POST /api/v1/operations/sync
```

### Formato de erro

Erros de API seguem o formato:

```json
{
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "mensagem descritiva"
  }
}
```

Status comuns:

- `200` — leitura/execução não persistida;
- `201` — criação/persistência;
- `204` — preflight CORS;
- `400` — argumento inválido;
- `401` — autenticação ausente/incorreta quando habilitada;
- `403` — mutação cross-origin bloqueada;
- `404` — recurso/rota ausente;
- `409` — conflito operacional;
- `413` — corpo acima de 1 MB;
- `429` — rate limit/limite de trabalho caro;
- `500` — falha inesperada.

---

## CLI

### Geração

```bash
npm run games:generate -- mega-sena data/contests.json 2
npm run games:generate -- lotofacil data/contests.json 4 8
npm run games:generate -- dia-de-sorte data/contests.json 4
```

### Conferência

```bash
npm run games:check -- data/games.json data/contests.json 3767
```

### Testes históricos

Os nomes dos scripts mantêm `backtest` por compatibilidade técnica:

```bash
npm run backtest:mega -- data/contests.json 2 20 2500 3047
npm run backtest:lotofacil -- data/contests.json 4 8 20 3500 3767
npm run backtest:dia -- data/contests.json 4 20 1000 1277
npm run backtest:compare -- data/contests.json 4 20 3500 3767
```

### Dados

Também existem comandos especializados:

```bash
npm run data:sync
npm run data:refresh
npm run db:profile
```

Para operação normal da base PostgreSQL, prefira os comandos `db:*` e `ops:sync` documentados nas seções anteriores e nos guias de dados.

---

## Testes e qualidade

### Quality gates estáticos

```bash
npm run quality:static
```

Executa:

- verificação da plataforma/Node;
- TypeScript typecheck;
- verificação de formatação;
- lint baseado em TypeScript com regras adicionais de unused/fallthrough.

### Build

```bash
npm run build
```

Ou separadamente:

```bash
npm run build:server
npm run web:build
```

Build de produção:

```bash
npm run build:prod
```

### Testes com cobertura

```bash
npm test
```

Os thresholds atuais são:

| Métrica | Mínimo |
| --- | ---: |
| Lines | 78% |
| Branches | 75% |
| Functions | 85% |

### Checagem local combinada

```bash
npm run check
```

Executa quality gates, build e suíte com coverage.

### Atenção com banco durante testes

`npm test` **não carrega `.env` automaticamente de propósito**. Alguns testes de integração manipulam/limpam tabelas. Não exporte manualmente `DATABASE_URL` apontando para uma base de desenvolvimento ou produção que contenha dados importantes.

No GitHub Actions, a suíte recebe um PostgreSQL isolado chamado `loto_lab_test`.

---

## E2E em navegador real

Os scripts de E2E usam Chrome/Chromium real via Chrome DevTools Protocol.

### Fluxo local recomendado

Terminal 1:

```bash
npm run api:start
```

Terminal 2:

```bash
E2E_BASE_URL=http://127.0.0.1:5200 npm run e2e:browser
```

**Importante:** sem `E2E_BASE_URL`, os scripts usam `http://127.0.0.1:3099`, que é a porta utilizada pelo runner de CI para o container de teste.

Se o Chrome não estiver no `PATH`:

```bash
CHROME_PATH=/caminho/para/chromium \
E2E_BASE_URL=http://127.0.0.1:5200 \
npm run e2e:browser
```

A suíte agrega verificações de:

- navegação principal;
- Análises nas loterias suportadas;
- Gerador 2.0;
- Meus Jogos 2.0;
- legibilidade/tipografia computada;
- rotas críticas;
- fluxos operacionais;
- erros HTTP e erros de runtime no navegador.

---

## CI e Security

Todo push/PR para `main` passa por dois workflows independentes.

### CI

O workflow de CI executa:

1. Node.js `24.19.0`;
2. `npm ci`;
3. `npm run quality:static`;
4. `npm test` com coverage;
5. `npm run audit:prod`;
6. validação do Compose de produção;
7. build da imagem Docker;
8. smoke test da imagem;
9. smoke test de HTTP Basic;
10. E2E em navegador real contra a imagem de produção.

### Security

O workflow de segurança executa:

- CodeQL para JavaScript/TypeScript com queries de security + quality;
- Dependency Review em PRs, bloqueando vulnerabilidades runtime `HIGH`;
- build da imagem de produção;
- geração de **SBOM SPDX**;
- Trivy para vulnerabilidades `HIGH` e `CRITICAL`;
- bloqueio de vulnerabilidades `HIGH/CRITICAL` corrigíveis da imagem.

O Security workflow também roda semanalmente.

---

## Produção com Docker Compose

### 1. Criar configuração

```bash
cp .env.production.example .env.production
```

Troque obrigatoriamente os valores de senha antes de subir a stack:

```env
APP_AUTH_USER=loto-admin
APP_AUTH_PASSWORD=uma-senha-longa-e-aleatoria
POSTGRES_PASSWORD=outra-senha-longa-e-aleatoria
```

Configuração de exposição padrão:

```env
APP_BIND=127.0.0.1
APP_PORT=5200
PUBLIC_ORIGIN=http://localhost:5200
```

### 2. Validar Compose

```bash
npm run prod:config
```

### 3. Subir

```bash
npm run prod:up
```

### 4. Acompanhar logs

```bash
npm run prod:logs
```

### 5. Derrubar a stack

```bash
npm run prod:down
```

### Mapeamento de rede

A aplicação escuta `3000` **dentro do container** e é publicada no host por `APP_PORT`:

```text
127.0.0.1:5200  ->  app:3000
```

O PostgreSQL de produção fica apenas na rede Docker:

```text
app -> postgres:5432
```

Ele **não publica `5432` no host**.

### Exposição pública

Para acesso fora de uma máquina/rede confiável:

- mantenha `APP_BIND=127.0.0.1` quando um reverse proxy estiver no mesmo host;
- coloque Nginx/Caddy/Traefik ou equivalente na frente;
- use HTTPS;
- configure `PUBLIC_ORIGIN` com a origem HTTPS real;
- não exponha HTTP Basic por HTTP aberto na internet.

`ALLOW_INSECURE_PUBLIC_HTTP=true` existe apenas como exceção emergencial/local e não deve ser usado como configuração normal de produção.

Detalhes em [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## Backup e restore check

Backup operacional:

```bash
npm run ops:backup
```

Verificação de restauração:

```bash
npm run ops:restore-check
```

Esses scripts carregam `.env.production` quando disponível. Consulte a documentação de deployment/operations antes de automatizar retenção ou restaurar dados importantes.

---

## Segurança

### HTTP Basic em produção

Quando `APP_AUTH_USER` e `APP_AUTH_PASSWORD` estão configurados, toda UI/API exige HTTP Basic, exceto:

```text
/health
/health/live
/health/ready
```

### Proteção de mutações cross-origin

Métodos de escrita (`POST`, `PUT`, `PATCH`, `DELETE`) passam por validação de origem. O servidor considera `Origin`, `Sec-Fetch-Site` e a origem pública/configurada. Requisições cross-site inválidas recebem `403 CROSS_ORIGIN_MUTATION_BLOCKED`.

### Limite de body

Bodies JSON possuem limite de **1 MB**.

### Rate limiting e trabalho caro

Fluxos sensíveis e operações pesadas usam rate limiting/gates para limitar concorrência e consumo de CPU/memória.

### Hardening do container

A aplicação de produção usa:

- `no-new-privileges:true`;
- `cap_drop: ALL`;
- filesystem do container em `read_only`;
- `tmpfs` para `/tmp`;
- PostgreSQL isolado da interface de rede do host.

### Dependências e supply chain

CI/Security incluem audit, Dependency Review, CodeQL, SBOM e Trivy. Actions são pinadas por commit no workflow.

---

## IA opcional

A integração é habilitada quando `OPENAI_API_KEY` está configurada.

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna
```

Sem chave, o core estatístico continua operacional. A IA é uma camada de interpretação, não uma dependência para:

- sincronização;
- análise matemática;
- geração;
- conferência;
- métricas financeiras;
- testes históricos;
- Laboratório.

Consulte [`docs/AI.md`](docs/AI.md).

---

## Métricas financeiras

Principais campos usados no projeto:

- `totalCost`: custo de todos os jogos simulados;
- `financialCost`: custo dos jogos para os quais há informação financeira aplicável;
- `totalPrizeValue`: soma dos prêmios conhecidos;
- `financialCoverage`: proporção coberta por informação financeira;
- `netResult`: prêmio menos custo coberto/real conforme o contexto;
- `returnRate`: prêmio dividido pelo custo;
- `roi`: `(prêmio - custo) / custo`.

### Agregação de ROI

Não some nem faça média simples de ROIs de loterias/execuções com bases de custo diferentes. Para um agregado financeiro válido, agregue custo e resultado/prêmio primeiro e então calcule a razão correspondente.

Detalhes em [`docs/FINANCIALS.md`](docs/FINANCIALS.md).

---

## Regra anti-leakage

Ao testar o concurso `N`, o algoritmo recebe somente concursos **anteriores a N**.

```text
histórico permitido: ... N-3, N-2, N-1
alvo do teste:       N
proibido no input:   N, N+1, N+2, ...
```

O resultado do próprio concurso e qualquer dado futuro ficam invisíveis durante a geração/avaliação do alvo.

Essa regra vale para:

- testes históricos tradicionais;
- walk-forward/validação progressiva;
- comparações de estratégia;
- Laboratório;
- qualquer experimento que declare desempenho histórico.

Consulte [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md).

---

## Estrutura do repositório

```text
.github/
└── workflows/
    ├── ci.yml
    └── security.yml

db/
└── migrations/               migrations PostgreSQL

docs/
├── design/                   contrato e referência visual
├── ROADMAP.md
├── API.md
├── WEB.md
├── ANALYSES.md
├── GENERATION.md
├── MY_GAMES.md
├── STRATEGY_LAB.md
├── DATABASE.md
├── DATA_OPERATIONS.md
├── OPERATIONS.md
├── DEPLOYMENT.md
└── ...

scripts/                       build, E2E, backup e verificações

src/
├── ai/                        adapters e contratos de IA
├── analysis/                  análise estatística
├── api/                       HTTP, controllers, routes, auth, workers
├── application/               use cases e portas da aplicação
├── backtest/                  motores de testes históricos
├── checker/                   conferência de jogos
├── cli/                       entrypoints CLI
├── data/                      fontes/sincronização de dados
├── db/                        infraestrutura PostgreSQL/migrations
├── domain/                    tipos e regras centrais
├── finance/                   preços e métricas financeiras
├── generator/                 geração e planejamento
├── lab/                       Strategy Lab
├── lotteries/                 configurações por loteria
├── notifications/             notificações/agenda
├── observability/             logs e sinais operacionais
├── operations/                sincronização operacional
├── persistence/               repositories PostgreSQL
└── realBets/                  regras de apostas reais

tests/                         testes unitários, contratos e integração

web/
├── index.html                 aplicação principal
├── design-system.css          foundations visuais do Protótipo 1
├── shell.js                   shell/navegação
├── feature-loader.js          lazy loading de features
├── app.js                     views principais legadas/em migração
└── *.js / *.css               módulos por superfície

web-dist/                      saída gerada do build web
dist/                          saída TypeScript compilada
```

`dist/` e `web-dist/` são artefatos de build; alterações funcionais devem ser feitas nas fontes correspondentes.

---

## Fluxo de desenvolvimento e PR

O fluxo adotado no projeto prioriza mudanças pequenas e verificáveis.

### 1. Issue/escopo

Mudanças relevantes devem partir de uma issue ou roadmap claro. Refactors grandes são quebrados em fatias verticais para reduzir risco e facilitar review.

### 2. Branch

Use uma branch dedicada ao escopo. Evite acumular trabalho não relacionado no mesmo PR.

### 3. Testes/contratos

Quando uma responsabilidade muda de camada, os testes devem acompanhar a nova arquitetura em vez de fixar a localização antiga do código. Gates não devem ser “afrouxados” para fazer um refactor passar.

### 4. Pull request

Antes de mergear:

1. revisar o diff completo;
2. corrigir achados do próprio review;
3. aguardar **CI verde**;
4. aguardar **Security verde**;
5. confirmar browser E2E quando aplicável;
6. conferir threads/reviews abertas;
7. executar **auto code review final no SHA exato que será mergeado**;
8. se houver qualquer nova correção, repetir os gates no novo SHA;
9. preferir squash merge para manter a `main` legível.

### 5. Redesign visual

PRs de redesign seguem o contrato em [`docs/design/PROTOTYPE_1_DARK_MODERN.md`](docs/design/PROTOTYPE_1_DARK_MODERN.md). Não misture direções dos protótipos descartados nem altere backend/domínio apenas para facilitar layout.

---

## Troubleshooting

### `ECONNREFUSED` no PostgreSQL

Confira se o container está saudável:

```bash
docker compose ps
docker compose logs postgres
```

A conexão local padrão deve apontar para **5434**, não 5432:

```env
DATABASE_URL=postgresql://loto_lab:loto_lab@localhost:5434/loto_lab
```

### Porta 5200 já está em uso

Descubra o processo que ocupa a porta ou altere `API_PORT` temporariamente no `.env`. Se mudar a porta, use a mesma URL em testes manuais/E2E.

### E2E tenta acessar 3099

Isso é o default dos scripts para CI. Localmente use:

```bash
E2E_BASE_URL=http://127.0.0.1:5200 npm run e2e:browser
```

### `Chrome/Chromium executable was not found`

Instale Chrome/Chromium ou informe:

```bash
CHROME_PATH=/caminho/para/chrome
```

### `401 Unauthorized` em produção

A stack de produção exige HTTP Basic. Abra o navegador com as credenciais configuradas em `APP_AUTH_USER`/`APP_AUTH_PASSWORD` ou use:

```bash
curl -u "$APP_AUTH_USER:$APP_AUTH_PASSWORD" http://127.0.0.1:5200/
```

Health checks continuam públicos.

### `403 CROSS_ORIGIN_MUTATION_BLOCKED`

Verifique `PUBLIC_ORIGIN`/`API_CORS_ORIGIN` e confirme que o browser está usando a mesma origem configurada. Em desenvolvimento simples no mesmo processo, deixe essas variáveis sem definição.

### IA não responde

Confirme `OPENAI_API_KEY`. A ausência/falha da IA não deve impedir os fluxos estatísticos principais.

### Dados parecem desatualizados

Confira:

```bash
npm run db:status
npm run ops:sync
```

Também consulte `/api/v1/data/status` e `/api/v1/operations/status`.

---

## Documentação detalhada

| Documento | Conteúdo |
| --- | --- |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | prioridades e roadmap geral |
| [`docs/MENTAL_MODEL.md`](docs/MENTAL_MODEL.md) | modelo mental do produto |
| [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) | metodologia estatística e anti-leakage |
| [`docs/ANALYSES.md`](docs/ANALYSES.md) | Análises 2.0 |
| [`docs/GENERATION.md`](docs/GENERATION.md) | geração e planejamento |
| [`docs/MY_GAMES.md`](docs/MY_GAMES.md) | lotes, comparação e apostas reais |
| [`docs/STRATEGY_LAB.md`](docs/STRATEGY_LAB.md) | Laboratório de Estratégias |
| [`docs/FINANCIALS.md`](docs/FINANCIALS.md) | custos, prêmios, cobertura e ROI |
| [`docs/API.md`](docs/API.md) | API HTTP |
| [`docs/WEB.md`](docs/WEB.md) | interface web |
| [`docs/DATABASE.md`](docs/DATABASE.md) | PostgreSQL e persistência |
| [`docs/DATA_OPERATIONS.md`](docs/DATA_OPERATIONS.md) | bootstrap e sincronização |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | scheduler/operação |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | produção, rede e segurança |
| [`docs/AI.md`](docs/AI.md) | integração opcional de IA |
| [`docs/AGENDA.md`](docs/AGENDA.md) | agenda/notificações |
| [`docs/design/PROTOTYPE_1_DARK_MODERN.md`](docs/design/PROTOTYPE_1_DARK_MODERN.md) | contrato visual oficial |

---

## Aviso

O Loto Lab organiza, executa e mede estratégias de composição de jogos. Ele **não garante prêmio**, **não prevê sorteios** e **não aumenta a probabilidade matemática individual de uma combinação válida apenas por usar histórico, pontuação ou IA**.

Use resultados históricos como evidência para comparação e estudo, não como promessa de resultado futuro.
