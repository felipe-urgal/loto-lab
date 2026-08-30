# Performance

Performance no Loto Lab é tratada como propriedade transversal: tempo de carregamento, responsividade visual, custo dos cálculos, volume transferido entre workers, consultas PostgreSQL e estabilidade operacional precisam ser medidos sem enfraquecer auditabilidade.

## Frontend

O build web é executado por:

```bash
npm run web:build
```

Ele não adiciona bundler ou framework de runtime. O processo:

- copia os assets para `web-dist`;
- calcula fingerprint SHA-256 do build;
- grava `build-manifest.json`;
- adiciona `?v=<hash>` aos assets referenciados pelo HTML;
- usa cache imutável somente quando a versão da URL corresponde ao build atual;
- responde `no-store` para URL versionada inválida/stale;
- mantém HTML com política apropriada para revalidação;
- mantém assets do build em memória depois da primeira leitura do processo.

## Design System e ownership visual

O frontend atual possui:

- `styles.css` e `ui-foundation.css` como base histórica/fundação;
- `design-system.css` como linguagem compartilhada do Protótipo 1;
- folhas `*-workspace.css` como ownership final das superfícies redesenhadas;
- folhas funcionais específicas apenas quando ainda possuem responsabilidade real da feature.

A consolidação visual deve remover CSS somente quando o seletor estiver comprovadamente sem consumidor ou quando o valor tiver sido absorvido pela fonte canônica. Nome `hardening`/`refinements` por si só não é motivo para apagar uma camada funcional.

Não existem mais `readability.css`, `readability.js` ou `localization.js` como correção global de runtime. Copy PT-BR, legibilidade e semântica de estados pertencem à própria fonte.

## Carregamento por view

A aplicação principal usa `web/feature-loader.js` para carregar apenas o que a view precisa.

Exemplos:

- Painel: `dashboard-scope` + `data-status`;
- Análises: camadas funcionais do Analysis 2.0 + `analysis-workspace`;
- Gerador: Generator 2.0, readiness, explicabilidade + `generation-workspace`;
- Meus Jogos: My Games 2.0 + auditabilidade + `my-games-workspace`, com fallback funcional se o módulo principal não montar;
- Testes históricos: refinamentos funcionais + `backtests-workspace`.

O loader:

- compartilha Promises de módulo e stylesheet;
- evita download/import duplicado;
- aguarda a tentativa de carregar o CSS antes do módulo associado quando necessário;
- mantém fallback funcional quando uma camada opcional falha;
- emite `loto-lab:view-rendered` somente após o render principal deixar o estado de loading.

Esse lifecycle reduz FOUC/layout shift e evita que módulos opcionais substituam a tela antes de o owner principal concluir o render.

## Páginas dedicadas

Laboratório, Estratégias, Execuções, Agenda e IA possuem documentos HTML próprios e folhas de workspace do Protótipo 1.

Nessas superfícies, a regra continua a mesma: o CSS de apresentação não deve duplicar regra de domínio ou criar dados/gráficos fictícios apenas para preencher layout.

## CPU e trabalhos pesados

Cálculos CPU-bound não devem bloquear o event loop HTTP.

Hoje o projeto usa `worker_threads` para fluxos pesados, incluindo:

- análise avançada;
- backtests interativos;
- Strategy Lab;
- planejamento pesado do gerador quando aplicável.

Os controllers permanecem responsáveis por transporte/validação, enquanto application use cases e adapters coordenam o trabalho.

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

Artefatos grandes usados apenas durante o cálculo não devem atravessar desnecessariamente a fronteira do worker.

A execução compacta rounds antes da persistência/retorno, preservando somente o necessário para auditoria. Estruturas como todos os jogos intermediários e checks completos não são persistidas quando o contrato compacto é suficiente.

Isso reduz:

- memória do processo;
- custo de `postMessage`;
- volume PostgreSQL;
- tempo de serialização.

## Análise avançada

Análise avançada possui worker e lifecycle próprios.

A revisão do histórico é identificada por assinatura do conteúdo relevante. Para a mesma loteria/revisão:

- chamadas simultâneas podem compartilhar o mesmo trabalho in-flight;
- resultado concluído pode ser reutilizado enquanto a assinatura do histórico não mudar;
- falha não deve envenenar o registro in-flight para a tentativa seguinte.

Uma correção retroativa no histórico muda a assinatura e invalida o snapshot, mesmo que o número do último concurso não tenha mudado.

## PostgreSQL

Use profiling real antes de criar índice:

```bash
npm run db:profile -- mega-sena
npm run db:profile -- lotofacil
npm run db:profile -- dia-de-sorte
```

O comando usa `EXPLAIN (ANALYZE, BUFFERS)` nos hot paths relevantes.

A política é:

1. medir;
2. identificar o plano dominante;
3. alterar query/índice quando houver evidência;
4. comparar antes/depois;
5. manter somente a otimização que resolve um gargalo real.

## Testes e concorrência

A suíte PostgreSQL usa databases temporários isolados por arquivo integrado. A concorrência global de testes é deliberadamente limitada a 2 para reduzir disputa entre PostgreSQL, worker threads e runner do CI.

Aumentar paralelismo sem medir tempo total/instabilidade não é considerado otimização.

## Browser E2E

`npm run e2e:browser` encadeia os fluxos reais de navegador para:

- navegação principal;
- Análises nas loterias suportadas;
- Generator 2.0;
- My Games 2.0;
- legibilidade;
- rotas críticas;
- fluxos operacionais.

O E2E é também um guardrail de performance percebida: loading infinito, montagem duplicada, erro de runtime, layout não utilizável e navegação quebrada devem falhar antes do merge.

## Metas de experiência

Para medições reais no navegador, usar como guardrails no percentil 75:

- LCP <= 2,5 s;
- INP <= 200 ms;
- CLS <= 0,1.

Essas metas não substituem revisão qualitativa. Também validar:

- teclado e foco visível;
- nomes acessíveis em controles icon-only;
- `prefers-reduced-motion`;
- ausência de overflow horizontal indevido;
- desktop, tablet e mobile;
- estados loading/empty/error/success;
- estabilidade da navegação durante carregamento assíncrono.

## Próximas otimizações

O backlog de performance deve seguir evidência e está concentrado principalmente em #65 e, para hotspots matemáticos, #62.

Não antecipar:

- mais workers;
- cache adicional;
- novos índices;
- limites maiores de concorrência;
- otimização de CSS/JS por microbenchmark isolado.

Primeiro medir CPU, heap, latência, query plan ou métrica de navegador que demonstre o gargalo.
