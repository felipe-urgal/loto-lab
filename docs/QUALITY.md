# Qualidade e gates de engenharia

Este documento detalha os checks que protegem o baseline técnico do Loto Lab. A receita operacional do dia a dia fica em [`DEVELOPMENT.md`](DEVELOPMENT.md).

## Gate canônico

Antes de abrir ou atualizar um PR:

```bash
npm ci
npm run check
```

`npm run check` executa:

```text
quality:static
-> build
-> test:run
```

`quality:static` executa:

```text
production:contract:verify
-> format:check
-> lint
```

`lint` inclui:

- `platform:verify`;
- TypeScript backend com `--noEmit --noUnusedLocals --noUnusedParameters --noFallthroughCasesInSwitch`;
- TypeScript frontend com os mesmos guardrails.

O script `typecheck` permanece disponível isoladamente. Ele não é repetido dentro de `quality:static` porque `lint` já executa os dois projetos TypeScript com regras mais estritas.

A suíte funcional roda sem instrumentação obrigatória de coverage, conforme a decisão do PR #201.

## Typecheck e lint

O typecheck isolado usa:

```bash
npm run typecheck
```

O lint é deliberadamente enxuto e baseado no compilador TypeScript, sem adicionar um linter de estilo completo. O objetivo é bloquear problemas estáticos objetivos com baixo custo de manutenção.

`platform:verify` também protege:

- versão exata de Node em local/CI/Docker;
- alinhamento de `@types/node` e TypeScript;
- lockfile;
- permissões/concurrency/timeout do CI;
- existência do gate canônico `npm run check` no workflow;
- baseline do workflow de Security;
- documentação de plataforma.

## Higiene de texto

```bash
npm run format:check
```

Verifica arquivos versionados e falha em caso de:

- BOM UTF-8;
- CRLF/CR em vez de LF;
- espaços ou tabs no fim das linhas.

Não é um formatter opinativo como Prettier. Arquivos legados sem newline final podem ser normalizados gradualmente quando tocados, sem churn em massa.

## Isolamento PostgreSQL

A suíte inclui testes unitários, integração, API e persistência. Suítes PostgreSQL usam database temporário exclusivo por arquivo integrado.

O helper `tests/helpers/postgres.ts`:

- cria database temporário isolado;
- aplica migrations reais por padrão;
- encerra o pool antes do cleanup;
- força remoção do database se houver leak de conexão, preservando a falha original.

O isolamento por database é intencional porque o Loto Lab também exerce advisory locks reais em migrations, runtime e operações.

Os testes compilados rodam com:

```text
--test-concurrency=2
```

Aumentar concorrência exige medição do pipeline completo e estabilidade comprovada.

## Coverage

Coverage é diagnóstico, não meta percentual nem gate obrigatório:

```bash
npm run coverage
```

O comando usa o runner nativo do Node.js 24 sobre a suíte compilada e não aplica thresholds globais.

Use coverage para identificar lacunas relevantes em comportamento e invariantes, não para criar testes artificiais que apenas defendem porcentagem.

Detalhes em [`TESTING.md`](TESTING.md).

## E2E

Browser E2E é direcionado por risco/escopo:

```bash
E2E_BASE_URL=http://127.0.0.1:5200 npm run test:e2e
```

Execute quando a mudança afetar fluxos browser-first, navegação, autenticação, estados críticos ou regressão visual/operacional relevante.

E2E não é custo fixo de todo PR no pipeline atual.

## Auditoria de dependências

A auditoria de dependências de produção permanece disponível:

```bash
npm run audit:prod
```

Ela usa:

```text
npm audit --omit=dev --audit-level=high
```

Execute quando a mudança tocar dependências/runtime, antes de release relevante ou quando houver alerta de segurança.

## CI funcional

`.github/workflows/ci.yml` roda em PRs e pushes para `main`.

Fluxo:

```text
checkout
-> Node 24.19.0
-> npm ci
-> PostgreSQL efêmero
-> npm run check
```

O job mantém:

- `contents: read`;
- concurrency por PR/ref;
- cancelamento somente de PR superseded;
- timeout global de 10 minutos;
- Actions pinadas por SHA;
- PostgreSQL pinado por digest.

O objetivo é que local e CI consumam a mesma interface obrigatória em vez de manter listas paralelas de lint/build/test.

## Security workflow

`.github/workflows/security.yml` é separado do CI funcional e atualmente roda:

- semanalmente;
- manualmente por `workflow_dispatch`.

Ele não é hoje um gate automático de todo PR.

Frentes atuais:

1. `npm run audit:prod`;
2. CodeQL JavaScript/TypeScript com `security-and-quality`;
3. build da imagem de produção;
4. SBOM SPDX JSON via Syft;
5. Trivy para vulnerabilidades HIGH/CRITICAL.

Política do Trivy:

- todos os HIGH/CRITICAL são reportados;
- HIGH/CRITICAL com correção disponível bloqueiam o workflow;
- achados sem correção permanecem visíveis sem tornar o branch permanentemente impossível de liberar.

CodeQL é o único job com `security-events: write`; o restante permanece `contents: read`.

## Checks de produção

Preflight de produção é separado do gate de PR:

```bash
npm run prod:check
```

Ele valida o Compose usando `.env.production.example`, executa os checks estáticos e faz `build:prod`, sem carregar secrets reais nem alterar a stack ativa.

O procedimento completo está em [`PRODUCTION.md`](PRODUCTION.md).

## Regra para falhas

Não faça retry cego nem enfraqueça checks para obter verde.

1. abra o log;
2. identifique a causa raiz;
3. diferencie bug, contrato stale, teste incorreto e infraestrutura;
4. corrija a fonte adequada;
5. gere novo SHA;
6. reexecute os gates aplicáveis;
7. repita o auto code review final.

## Resumo

Sempre obrigatório antes do PR:

```bash
npm run check
```

Direcionados por risco/escopo:

```bash
npm run test:e2e
npm run coverage
npm run audit:prod
npm run prod:check
```

Uma validação só deve virar custo fixo de todo PR quando proteger um contrato material que justifique esse custo.
