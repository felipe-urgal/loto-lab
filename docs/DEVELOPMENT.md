# Desenvolvimento

Este é o ponto de entrada canônico para preparar o ambiente local, subir o Loto Lab, validar mudanças e preparar um PR.

Documentos especializados continuam em:

- [`TESTING.md`](TESTING.md): estratégia de testes e coverage;
- [`QUALITY.md`](QUALITY.md): detalhes dos gates e supply chain;
- [`DATABASE.md`](DATABASE.md): PostgreSQL, migrations e repositories;
- [`DATA_OPERATIONS.md`](DATA_OPERATIONS.md): bootstrap e manutenção do histórico;
- [`PLATFORM.md`](PLATFORM.md): baseline Node/TypeScript;
- [`WEB.md`](WEB.md): frontend e lifecycle.

## Pré-requisitos

- Node.js `24.19.0`;
- npm;
- Docker Engine;
- Docker Compose v2;
- Chrome/Chromium somente quando `test:e2e` for necessário.

## Primeira execução

```bash
nvm use
npm ci
cp .env.example .env
npm run dev
```

`npm run dev` sobe o PostgreSQL local do projeto e inicia a aplicação em:

```text
http://127.0.0.1:5200
```

O startup da API aplica migrations pendentes. Para análises e backtests úteis, carregue o histórico uma vez em outro terminal:

```bash
npm run db:bootstrap
```

O PostgreSQL local fica em `localhost:5434`.

## Ciclo normal de uma mudança

Depois de implementar a issue e os testes correspondentes:

1. execute `npm run dev`;
2. valide manualmente o fluxo alterado quando aplicável;
3. execute o gate canônico:

```bash
npm run check
```

`npm run check` executa:

```text
quality:static
-> build
-> test:run
```

`quality:static` cobre:

```text
production:contract:verify
-> format:check
-> lint
```

`lint` inclui `platform:verify` e os dois projetos TypeScript (`tsconfig.json` e `tsconfig.web.json`) com checks de tipos e regras de unused/fallthrough. O script `typecheck` permanece disponível isoladamente, mas não é executado novamente dentro do gate para evitar a mesma compilação duas vezes.

A suíte funcional usa PostgreSQL quando necessário e roda sem thresholds artificiais de coverage, conforme a decisão do PR #201.

## Checks direcionados

### E2E

Quando a mudança afetar fluxo browser-first, navegação, autenticação ou regressão visual/operacional relevante:

```bash
E2E_BASE_URL=http://127.0.0.1:5200 npm run test:e2e
```

E2E não é custo fixo de todo PR.

### Coverage

Para investigar lacunas de testes:

```bash
npm run coverage
```

Coverage é diagnóstico, não meta percentual obrigatória.

### Dependências e segurança

Quando a mudança tocar dependências/runtime ou quando a auditoria fizer sentido:

```bash
npm run audit:prod
```

CodeQL, Trivy e SBOM continuam no workflow de Security conforme [`QUALITY.md`](QUALITY.md).

### Formatação, plataforma e contrato de produção

Os checks abaixo permanecem disponíveis isoladamente:

```bash
npm run format:check
npm run platform:verify
npm run production:contract:verify
npm run typecheck
```

## Dataset offline x PostgreSQL

PostgreSQL é a fonte de verdade operacional. Os arquivos JSON existem como dataset offline/legado para desenvolvimento, importação e ferramentas específicas.

Comandos do dataset JSON:

```bash
npm run dataset:sync -- mega-sena
npm run dataset:refresh -- mega-sena 1 100
```

Importar o dataset para PostgreSQL:

```bash
npm run db:import-dataset -- data/contests.json
```

Operações do banco:

```bash
npm run db:migrate
npm run db:bootstrap
npm run db:status
npm run db:sync -- mega-sena
npm run ops:sync
```

Essa separação de nomes evita confundir escrita em `data/contests.json` com sincronização da base PostgreSQL.

## CI

O workflow funcional `.github/workflows/ci.yml` faz:

```text
npm ci
-> npm run check
```

O CI usa PostgreSQL efêmero e a mesma interface obrigatória usada localmente. O workflow de Security permanece separado.

## Fluxo recomendado

```text
issue
-> branch curta
-> implementação + testes
-> npm run dev
-> validação manual quando aplicável
-> npm run check
-> npm run test:e2e quando o risco justificar
-> PR
-> CI / Security aplicáveis
-> auto code review no SHA final
-> merge
-> produção conforme PRODUCTION.md quando aplicável
```

Nenhum push posterior ao review final deve ser tratado como já revisado.

## Antes de declarar pronto

Leia também `AGENTS.md` na raiz e confira os documentos do domínio alterado.

Mudanças de deploy, backup, restore, Compose ou operação real seguem [`PRODUCTION.md`](PRODUCTION.md).
