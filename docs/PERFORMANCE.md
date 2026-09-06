# Performance

Performance no Loto Lab é tratada como propriedade transversal: tempo de carregamento, responsividade visual, custo dos cálculos, volume transferido entre workers, consultas PostgreSQL e estabilidade operacional precisam ser medidos sem enfraquecer auditabilidade.

A regra para otimização é simples:

> **medir → mudar uma causa concreta → medir novamente sob condição comparável.**

## Frontend e build

O build web é executado por:

```bash
npm run web:build
```

Ele não adiciona bundler nem framework de runtime. O processo:

- copia assets para `web-dist` sem publicar fontes `.ts` cruas;
- compila `web/src/**/*.ts` para JavaScript nativo em `web-dist/assets/src`;
- calcula fingerprint SHA-256 do build;
- grava `build-manifest.json`;
- adiciona `?v=<hash>` aos assets referenciados pelo HTML;
- usa cache imutável somente quando a versão da URL corresponde ao build atual;
- responde `no-store` para URL versionada inválida/stale;
- mantém HTML com política de revalidação apropriada;
- mantém assets do build em memória depois da primeira leitura do processo.

## Ownership do carregamento por view

`web/src/core/featureLoader.ts` é o owner canônico do lazy loading, cache de assets e coordenação com o lifecycle compartilhado. `web/feature-loader.js` é apenas um boundary JavaScript fino que importa o JavaScript emitido.

As principais superfícies já possuem owners funcionais em `web/src/features`, incluindo Painel/status, Agenda, IA, Estratégias, Execuções, Laboratório, Meus Jogos, Análises, Gerador e Testes históricos. Boundaries JavaScript migrados permanecem import-only e não devem reintroduzir fallback funcional paralelo.

O loader:

- compartilha Promises de módulo e stylesheet;
- evita download/import duplicado;
- aguarda a tentativa de carregar CSS antes do módulo associado quando necessário;
- coordena montagem com o lifecycle compartilhado;
- trata falha de asset de forma explícita quando a feature não possui fallback deliberado;
- não duplica implementação funcional dentro do shell.

Detalhes de ownership atual: [`WEB.md`](WEB.md).

## Design System e ownership visual

O frontend atual possui:

- `styles.css` e `ui-foundation.css` como base/fundação;
- `design-system.css` como linguagem compartilhada do Protótipo 1;
- folhas `*-workspace.css` como apresentação canônica das superfícies redesenhadas;
- folhas funcionais específicas somente quando ainda possuem responsabilidade real.

A consolidação visual deve remover CSS apenas quando o seletor estiver comprovadamente sem consumidor ou quando a responsabilidade já tiver sido absorvida por uma fonte canônica. Nome `hardening`/`refinements` por si só não é motivo para apagar uma camada funcional.

Não existem mais `readability.css`, `readability.js` ou `localization.js` como correção global de runtime.

## CPU e trabalhos pesados

Cálculos CPU-bound não devem bloquear o event loop HTTP.

O projeto usa `worker_threads` em fluxos pesados, incluindo análise avançada, backtests interativos e Strategy Lab; planejamento pesado do gerador também respeita os limites definidos pelo fluxo.

Controllers permanecem responsáveis por transporte/validação, enquanto application use cases e adapters coordenam trabalho e persistência.

## Gate de trabalho caro

Backtest e Strategy Lab compartilham um gate conservador para evitar análises caras simultâneas no mesmo processo.

O contrato inclui:

- uma execução pesada por vez quando a feature usa o gate compartilhado;
- timeout;
- propagação de `AbortSignal`;
- término explícito do worker em timeout/cancelamento;
- liberação do gate em sucesso e falha;
- cancelamento quando o cliente HTTP desconecta, quando suportado pelo fluxo.

A fila assíncrona não deve ser usada para contornar limites do endpoint interativo.

## Transferência e persistência de backtests

Artefatos grandes usados apenas durante cálculo não devem atravessar desnecessariamente a fronteira do worker.

A execução compacta rounds antes da persistência/retorno, preservando o necessário para auditoria. Estruturas como todos os jogos intermediários e checks completos não são persistidas quando o contrato compacto é suficiente.

Isso reduz memória do processo, custo de `postMessage`, volume PostgreSQL e tempo de serialização.

## Análise avançada

Análise avançada possui worker e lifecycle próprios. A revisão do histórico é identificada por assinatura do conteúdo relevante.

Para a mesma loteria/revisão:

- chamadas simultâneas podem compartilhar o mesmo trabalho in-flight;
- resultado concluído pode ser reutilizado enquanto a assinatura do histórico não mudar;
- falha não deve envenenar o registro in-flight para a tentativa seguinte.

Uma correção retroativa no histórico muda a assinatura e invalida o snapshot, mesmo que o número do último concurso não tenha mudado.

A #62 está decompondo `src/analysis/advanced.ts` sem alterar metodologia; continuidade/qualidade já possui owner dedicado em `src/analysis/continuity.ts`. Refactor estrutural não deve ser vendido como otimização sem medição.

## PostgreSQL

Use profiling real antes de criar índice:

```bash
npm run db:profile -- mega-sena
npm run db:profile -- lotofacil
npm run db:profile -- dia-de-sorte
```

O comando usa `EXPLAIN (ANALYZE, BUFFERS)` nos hot paths relevantes.

Política:

1. medir;
2. identificar o plano dominante;
3. alterar query/índice quando houver evidência;
4. comparar antes/depois;
5. manter somente a otimização que resolve um gargalo real.

O endpoint operacional autenticado também expõe pressão do pool PostgreSQL (`total`, `idle`, `active`, `waiting`) para observação. Isso não define automaticamente pool size, timeout ou SLO.

## CPU e memória dos containers

Antes de definir limites de CPU/memória ou elevar concorrência em produção, capture uma amostra read-only:

```bash
npm run prod:resources
```

O comando executa `docker compose stats --no-stream --format json app postgres` usando `.env.production`.

Uma amostra isolada **não** define capacidade, limite nem SLO. Para justificar tuning, compare medições sob carga equivalente e registre release, horário, tipo de carga e interpretação do antes/depois.

Procedimento operacional completo: [`PRODUCTION.md`](PRODUCTION.md).

## Observabilidade antes de tuning

O endpoint operacional autenticado já expõe sinais de cardinalidade controlada para:

- HTTP;
- Analysis Jobs;
- sync;
- pool PostgreSQL;
- requests à CAIXA;
- requests à OpenAI.

Esses sinais formam baseline. A #63 ainda precisa transformar observação real em poucos SLOs/runbooks; não alterar retry, backoff, timeout, pool ou concorrência apenas porque uma métrica passou a existir.

## Testes e concorrência

A suíte PostgreSQL usa databases temporários isolados por arquivo integrado. A concorrência global de testes é deliberadamente limitada a 2 para reduzir disputa entre PostgreSQL, worker threads e runner do CI.

Aumentar paralelismo sem medir tempo total/instabilidade não é otimização.

## Browser E2E

O comando canônico é:

```bash
E2E_BASE_URL=http://127.0.0.1:5200 npm run test:e2e
```

Ele encadeia os fluxos reais de navegador para navegação principal, Análises, Generator 2.0, My Games 2.0, legibilidade, rotas críticas e fluxos operacionais.

O antigo alias `e2e:browser` **não** faz parte da interface pública atual.

O E2E também funciona como guardrail de performance percebida: loading infinito, montagem duplicada, erro de runtime, layout não utilizável e navegação quebrada devem falhar antes do merge.

## Metas de experiência

Quando houver medição representativa no navegador, usar como guardrails no percentil 75:

- LCP <= 2,5 s;
- INP <= 200 ms;
- CLS <= 0,1.

Essas metas não substituem revisão qualitativa. Também validar teclado/foco, nomes acessíveis, `prefers-reduced-motion`, overflow horizontal, desktop/tablet/mobile e estados loading/empty/error/success.

## Próximas otimizações

O backlog de performance está concentrado principalmente em #65 e, para hotspots matemáticos, #62.

Não antecipar:

- mais workers;
- cache adicional;
- novos índices;
- limites maiores de concorrência;
- limites de CPU/memória;
- tuning de retry/backoff;
- otimização de CSS/JS por microbenchmark isolado.

Primeiro medir CPU, heap, latência, query plan, sinal operacional ou métrica de navegador que demonstre o gargalo.
