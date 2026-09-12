# Performance

Performance no Loto Lab é uma propriedade operacional baseada em evidência. A regra permanente é:

> **medir → mudar uma causa concreta → medir novamente sob condição comparável.**

Nenhum índice, cache, timeout, retry/backoff, aumento de concorrência ou limite de CPU/memória deve nascer apenas de intuição ou de uma amostra isolada.

## Frontend e build

`npm run web:build` compila `web/src/**/*.ts` para JavaScript nativo, prepara `web-dist`, calcula o fingerprint do build e versiona os assets. `web/src/core/featureLoader.ts` é o owner canônico de lazy loading/cache/lifecycle; boundaries JavaScript migrados permanecem finos/import-only.

As superfícies principais já possuem owners TypeScript. Refactor estrutural só é justificável quando melhora ownership, acoplamento, duplicação, segurança, estado explícito ou testabilidade; redução de linhas por si só não é otimização.

## CPU e trabalhos pesados

Fluxos CPU-bound relevantes usam `worker_threads`, timeout/cancelamento e gate de trabalho caro quando aplicável. Backtests e Strategy Lab não podem usar a fila assíncrona para contornar limites do endpoint interativo.

Artefatos grandes usados somente durante cálculo são compactados antes de persistência/retorno quando o contrato auditável permitir.

## Análise avançada

A decomposição estrutural de `src/analysis/advanced.ts` está concluída: continuidade, estatística, estrutura, associações, ciclos, dinâmica e rolling validation possuem owners dedicados; `advanced.ts` permanece composition root.

Essa organização melhora ownership/testabilidade. Qualquer afirmação de ganho de performance exige medição própria.

## PostgreSQL

Antes de propor índice ou reescrita de query, use profiling real:

```bash
npm run db:profile -- mega-sena
npm run db:profile -- lotofacil
npm run db:profile -- dia-de-sorte
```

O fluxo é medir o plano dominante, alterar uma causa concreta, repetir a medição e manter somente a mudança que resolver o gargalo observado.

O endpoint operacional também expõe pressão do pool (`total`, `idle`, `active`, `waiting`). O snapshot não define automaticamente pool size ou timeout.

## CPU e memória de produção

Para capturar uma amostra read-only dos containers:

```bash
npm run prod:resources
```

Registre release, horário e tipo de carga para tornar comparações úteis. Uma única amostra não define capacidade ou limite.

## Observabilidade

A baseline estrutural cobre sinais de cardinalidade controlada para HTTP, Analysis Jobs, sync, pool PostgreSQL, CAIXA e OpenAI.

Runbooks acompanham esses sinais. SLO, alerta, timeout, retry/backoff, concorrência ou tuning futuro só devem ser definidos quando uma série comparável ou incidente real justificar trabalho concreto. Se houver implementação a fazer, ela recebe uma tarefa específica em vez de reabrir um epic genérico.

## Browser e experiência

O E2E canônico é:

```bash
E2E_BASE_URL=http://127.0.0.1:5200 npm run test:e2e
```

Além de correção funcional, ele protege contra loading infinito, montagem duplicada, erro de runtime, navegação quebrada e overflow estrutural.

Quando houver medição representativa no navegador, os guardrails de referência no percentil 75 são:

- LCP <= 2,5 s;
- INP <= 200 ms;
- CLS <= 0,1.

Esses números não substituem teclado/foco, nomes acessíveis, `prefers-reduced-motion`, desktop/tablet/mobile e estados loading/empty/error/success.

## Política pós-roadmap

A baseline estrutural de performance está concluída. Não existe backlog permanente de tuning.

Nova otimização deve começar com gargalo observável, hipótese explícita e critério de sucesso antes/depois. Não antecipar workers, caches, índices, concorrência, limites de recurso ou micro-otimizações sem evidência.

Detalhes operacionais: [`OPERATIONS.md`](OPERATIONS.md), [`PRODUCTION.md`](PRODUCTION.md) e [`RELIABILITY.md`](RELIABILITY.md).
