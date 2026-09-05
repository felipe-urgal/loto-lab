# Interface Web

A interface web do Loto Lab é servida pelo mesmo processo da API HTTP. O navegador renderiza e orquestra; cálculo estatístico, geração, conferência, financeiro e testes históricos continuam no backend/core.

## Execução local

```bash
cp .env.example .env
docker compose up -d postgres
npm run db:migrate
npm run api:start
```

Abra:

```text
http://127.0.0.1:5200
```

A API fica no mesmo processo em `/api/v1`.

## Arquitetura atual

O frontend continua **vanilla** — HTML, CSS e ES Modules — sem framework. Desde #148, a fonte pode avançar incrementalmente em TypeScript sob `web/src`, com emissão para JavaScript nativo antes de chegar ao navegador.

Estrutura principal:

```text
web/
├── index.html
├── lab.html
├── agenda.html
├── ai.html
├── strategies.html
├── jobs.html
├── shell.js
├── feature-loader.js
├── runtime.js
├── app.js
├── src/
│   ├── core/
│   │   ├── api.ts
│   │   ├── featureLoader.ts
│   │   └── viewLifecycle.ts
│   ├── features/
│   │   ├── agenda.ts
│   │   ├── ai.ts
│   │   ├── analysisV2.ts
│   │   ├── analysisV2/
│   │   │   └── types.ts
│   │   ├── backtests.ts
│   │   ├── dashboardScope.ts
│   │   ├── dashboardScope/
│   │   │   ├── financial.ts
│   │   │   └── types.ts
│   │   ├── dataStatus.ts
│   │   ├── generationV2.ts
│   │   ├── generationV2/
│   │   │   ├── enhancements.ts
│   │   │   ├── explainability.ts
│   │   │   ├── readiness.ts
│   │   │   └── types.ts
│   │   ├── jobs.ts
│   │   ├── lab.ts
│   │   ├── myGames.ts
│   │   ├── myGames/
│   │   │   ├── betForm.ts
│   │   │   ├── comparison.ts
│   │   │   ├── formatting.ts
│   │   │   ├── presentation.ts
│   │   │   ├── support.ts
│   │   │   └── types.ts
│   │   └── strategies.ts
│   └── shared/
│       ├── escaping.ts
│       ├── formatters.ts
│       └── toast.ts
├── design-system.css
├── ui-foundation.css
├── *-workspace.css
└── módulos/folhas específicos por feature
```

`web/src/core/featureLoader.ts` é o owner canônico do lazy loading das features, incluindo cache de assets e coordenação com o lifecycle compartilhado. `web/feature-loader.js` permanece apenas como boundary compatível para importar o JavaScript emitido. `runtime.js` permanece como boundary compatível para os módulos JavaScript existentes; helpers migrados vivem em `web/src` e podem ser reexportados sem forçar uma migração big-bang. API, escaping, formatters, lifecycle, feature loading e a primitive de toast já possuem ownership TypeScript; os boundaries JavaScript não redefinem essas implementações. O status operacional e o escopo do Painel possuem implementação canônica em `web/src/features`, seguido por Agenda, IA, Estratégias, Execuções, Laboratório, Meus Jogos, Análises, Gerador e Testes históricos. `web/dashboard-scope.js`, `web/data-status.js`, `web/agenda.js`, `web/ai.js`, `web/strategies.js`, `web/jobs.js`, `web/lab.js`, `web/my-games-v2.js`, `web/analysis-v2.js`, `web/generation-v2.js` e `web/backtests.js` permanecem apenas como boundaries de assets compatíveis e importam o JavaScript emitido das respectivas fontes TypeScript.

O escopo do Painel usa `web/src/features/dashboardScope.ts` como owner da orquestração e separa contratos/semântica financeira em `dashboardScope/types.ts` e `dashboardScope/financial.ts`. A feature consome diretamente API, escaping, formatters, toast e lifecycle compartilhados; não mantém parsing próprio da hash. Cargas de leitura são abortadas quando o owner perde a view, e valores financeiros ausentes permanecem desconhecidos em vez de virarem zero por coerção. Meus Jogos inicia a decomposição de uma feature grande durante a migração: state/lifecycle e orquestração ficam em `web/src/features/myGames.ts`, enquanto tipos, apresentação, formulário de aposta, comparação, formatação e guards possuem ownership separado em `web/src/features/myGames/`. Análises e Gerador seguem a mesma direção incremental: `web/src/features/analysisV2.ts` e `web/src/features/generationV2.ts` concentram a orquestração funcional de suas superfícies; `analysisV2/types.ts` e `generationV2/types.ts` tornam explícitos os contratos consumidos pela UI. No Gerador, readiness e explainability também têm owners internos tipados em `generationV2/readiness.ts` e `generationV2/explainability.ts`, coordenados por `generationV2/enhancements.ts` com o lifecycle compartilhado; os antigos `web/generation-readiness.js` e `web/generation-explainability.js` foram removidos. Testes históricos usa `web/src/features/backtests.ts` como owner funcional único da view, consumindo o mesmo client HTTP, lifecycle, escaping, formatters e toast compartilhados. `web/app.js` preserva apenas o handoff mínimo do shell para a view e não contém mais formulário, execução ou histórico de Backtests; `refinements.js` também não possui regra específica para essa superfície. API, escaping, lifecycle e feature loading vêm diretamente do core/shared TypeScript. O objetivo é reduzir acoplamento e duplicação sem introduzir framework nem mudar a jornada.

O build `npm run web:build` primeiro prepara `web-dist/`, ignora fontes `.ts` como assets brutos e depois usa o `tsc` com `tsconfig.web.json` para emitir JavaScript em `web-dist/assets/src`. O conjunto web continua alimentando o fingerprint SHA-256 usado para reescrever referências de assets com `?v=<hash>`.

`typecheck` e `lint` também cobrem `web/src/**/*.ts` com ambiente browser/DOM isolado do tsconfig do servidor.

HTML usa política sem cache permanente; assets fingerprintados podem usar cache imutável quando o hash corresponde ao build atual.

## Fonte de verdade visual

A direção oficial é o **Protótipo 1 — Dark Moderno / Workspace científico compacto**.

Referência: [`design/PROTOTYPE_1_DARK_MODERN.md`](design/PROTOTYPE_1_DARK_MODERN.md).

Regras principais:

- fundo azul-preto;
- superfícies azul-grafite;
- azul para ação, seleção e dado principal;
- verde somente para sucesso/resultado positivo;
- texto funcional >=16px;
- contraste/foco/teclado/reduced-motion obrigatórios;
- densidade compacta sem sacrificar leitura;
- gráficos somente quando existe dado real;
- mobile tratado como layout próprio, não desktop apenas empilhado.

## Estado do rollout

O rollout e a consolidação visual estão concluídos pela #121:

- #123 — Design System + shell;
- #124 — Painel;
- #125 — Análises;
- #126 — Gerador;
- #127 — Meus Jogos;
- #128 — Testes históricos;
- #129 — Laboratório;
- #130 — Estratégias;
- #131 — Execuções;
- #132 — Agenda;
- #133 — IA;
- #134–#137 — consolidação inicial de ownership/CSS legado;
- #139 — hardening visual de Análises absorvido no workspace;
- #140 — assets legados de diversidade do Gerador removidos;
- #141 — status visual do Painel absorvido no scope canônico;
- #142 — explainability visual do Gerador absorvida no workspace;
- #143 — auditoria final desktop/mobile de legibilidade, foco, reduced-motion e overflow estrutural.

A modularização arquitetural começou em #148 com a fundação TypeScript e os formatters compartilhados. As fatias seguintes moveram client HTTP, contrato de erro, escaping compartilhado, contrato de lifecycle da view e a primitive de toast para `web/src`; #177 começou a eliminar lifecycle duplicado nas features, #178 deu ownership TypeScript completo ao status de dados, e o escopo do Painel, Agenda, IA, Estratégias, Execuções, Laboratório, Meus Jogos, Análises, Gerador e Testes históricos seguem o mesmo padrão consumindo diretamente os helpers compartilhados. Em Painel, Meus Jogos, Análises e Gerador a migração também explicita owners menores para contratos e responsabilidades internas. O Gerador já absorveu readiness/explainability em módulos TypeScript internos e eliminou os listeners/hash parsing duplicados dessas camadas. Backtests já concluiu também a retirada do fallback funcional duplicado de `app.js`/`refinements.js`. A #194 moveu o ownership funcional do loader para `web/src/core/featureLoader.ts`, deixando `web/feature-loader.js` como boundary mínimo. Isso não altera o estado da #121 nem reabre trabalho visual concluído.

As folhas adicionais que permanecem têm responsabilidade funcional, estrutural ou de fallback explícita; coexistir com um `*-workspace.css` não torna uma camada automaticamente redundante.

## Cascata visual

Regra geral:

```text
styles.css
  ↓
ui-foundation.css
  ↓
design-system.css
  ↓
CSS funcional da feature, quando necessário
  ↓
stylesheet canônico da superfície
```

Folhas adicionais só permanecem quando ainda possuem responsabilidade funcional/estrutural real.

Não existem mais as camadas globais de correção:

- `readability.css`;
- `readability.js`;
- `localization.js`.

Copy PT-BR e legibilidade pertencem à fonte da própria feature.

## Telas

### Painel — `/#dashboard`

Prioriza:

1. resumo/KPIs reais;
2. estado do concurso/operação;
3. desempenho e conferência financeira;
4. atividade recente.

`web/src/features/dashboardScope.ts` é o owner canônico dos modos **Todas** e loteria focada. `web/dashboard-scope.js` é somente boundary compatível. Contratos consumidos pela UI ficam em `dashboardScope/types.ts`; agregação/tons financeiros ficam em `dashboardScope/financial.ts`. O owner usa lifecycle/API compartilhados, cancela leituras stale ao perder a view e não transforma custo, prêmio ou resultado ausente em zero.

No escopo **Todas**, agregações financeiras usam custo/resultados conhecidos em vez de média ingênua de percentuais. Se a base financeira necessária estiver incompleta, o agregado permanece `—`/indisponível em vez de fabricar um ROI.

### Análises — `/#analysis`

Workspace técnico com:

- Classificação;
- Estrutura;
- Dinâmica;
- Combinações;
- Validação.

A rota básica continua como fallback e a análise avançada monta quando disponível. Tabelas largas preservam scroll local no mobile sem expandir o documento.

`web/src/features/analysisV2.ts` é a implementação funcional canônica da camada avançada e consome diretamente `api`, escaping e o lifecycle compartilhado. Os contratos de resposta usados pela UI ficam em `web/src/features/analysisV2/types.ts`; `web/analysis-v2.js` é somente o boundary de asset compatível. A migração preserva os cinco modos, o `<dialog>` modal com teclado/foco e a degradação graciosa para a visão básica quando a rota avançada falha.

### Gerador — `/#generate`

Organiza análise, seleção, restrições, preview e auditoria. Seed/Preview ID permanecem auditáveis e o mobile usa stepper/layout próprio.

`web/src/features/generationV2.ts` é a implementação funcional canônica do Generator 2.0 e consome diretamente o client HTTP tipado, escaping e lifecycle compartilhado. Plano, baseline, espaços do algoritmo, auditoria, preview/save, jogos gerados, filtros e estado da UI ficam explícitos em `web/src/features/generationV2/types.ts`. Readiness de soma condicionada e explainability/auditoria visual vivem em `web/src/features/generationV2/readiness.ts` e `web/src/features/generationV2/explainability.ts`; `web/src/features/generationV2/enhancements.ts` monta e desmonta ambas usando `onViewRendered`/`onMainViewChanged`, sem parsing próprio de hash ou listeners globais duplicados. `web/generation-v2.js` é somente o boundary de asset compatível e importa o owner funcional + esse orchestrator interno. O fluxo `plano → prévia congelada → save exato`, modo diversificado, guardrails de Lotofácil, textos anti-previsão e rejeição de histórico stale permanecem preservados.

### Meus Jogos — `/#games`

Consolida:

- lifecycle de lotes;
- conferência;
- comparação;
- apostas reais;
- financeiro;
- ocultar/mostrar sem apagar histórico.

`web/src/features/myGames.ts` é o controller funcional canônico e consome diretamente API, lifecycle compartilhado, escaping e toast. A implementação é decomposta em `web/src/features/myGames/` para separar contratos, apresentação, formulário de aposta e comparação; `web/my-games-v2.js` é somente o boundary de asset compatível. O formatter financeiro da feature preserva `null`/ausente como `—`, sem transformar desconhecido em zero.

`my-games-v2.css` permanece como base funcional do módulo principal e `my-games-workspace.css` como apresentação final. `real-bets`/`my-games-management` permanecem apenas no fallback deliberado quando o módulo principal não monta.

### Testes históricos — `/#backtests`

`web/src/features/backtests.ts` é a implementação funcional canônica e única do formulário, execução e histórico persistido. A feature consome `api`, lifecycle, escaping, formatters e toast compartilhados, aborta requests ao perder ownership da view e rejeita respostas stale quando view/loteria mudam durante a carga. O padrão de últimos 100 concursos também pertence integralmente ao owner tipado.

`web/backtests.js` é somente o boundary de asset compatível. `web/app.js` não mantém mais uma segunda implementação da feature: ao entrar em `/#backtests`, o shell deixa apenas um loading marker com `data-feature-owned="backtests"`, permitindo que `featureLoader.ts` aguarde o render base sem criar um ciclo de espera. O loader carrega `backtests-workspace.css` antes de `backtests.js`, não carrega `refinements.js` para essa view e em caso de falha de asset mostra um estado explícito `FEATURE_LOAD_ERROR` com retry. Não há fallback funcional legado para reintroduzir comportamento divergente. Execução, worker, limites HTTP e contratos financeiros/metodológicos do backend não mudam.

### Laboratório — `/lab`

Compara hipóteses e estratégias com evidência, benchmark e progressive disclosure. `web/src/features/lab.ts` é a implementação funcional canônica e consome diretamente client HTTP, escaping e formatters compartilhados; `web/lab.js` permanece somente como boundary de asset compatível. O frontend preserva os contratos de benchmark, resolução Monte Carlo, AUC e walk-forward, e evita renderizar uma resposta antiga quando loteria ou experimento mudam durante a execução. `lab-workspace.css` é a folha canônica desde a consolidação #136.

Como primeira fatia funcional da jornada definida na #64, resultados visíveis do Laboratório oferecem o CTA nativo **Testar historicamente** para `/#backtests`. O link apenas preserva contexto de tarefa: não copia nem pré-preenche o formulário de Backtests, não cria query/hash state ad-hoc e não promove automaticamente a estratégia melhor ranqueada. Backtests continua sendo o owner exclusivo do teste histórico e sua rota permanece diretamente acessível.

### Estratégias — `/strategies`

Catálogo/versionamento com workspace próprio. `web/src/features/strategies.ts` é a implementação funcional canônica e consome diretamente client HTTP, escaping, formatters e toast compartilhados; `web/strategies.js` permanece somente como boundary compatível. Após #137 a superfície também não depende mais do antigo `experiments.css`.

### Execuções — `/jobs`

Fila persistente, estados e ações operacionais. `web/src/features/jobs.ts` é a implementação funcional canônica e consome diretamente client HTTP, escaping, formatters e toast compartilhados; `web/jobs.js` permanece somente como boundary compatível. Polling, cancelamento, stale-response guards e seleção de versões históricas continuam preservados. Também não depende mais de `experiments.css` após #137.

### Agenda — `/agenda`

Próximos concursos + notificações. `web/src/features/agenda.ts` é a implementação funcional canônica; `web/agenda.js` permanece somente como boundary de asset compatível. `agenda-workspace.css` é canônico; `agenda.css` foi removido.

### IA — `/ai`

Interpretação de evidências. `web/src/features/ai.ts` é a implementação funcional canônica e consome diretamente o client HTTP, escaping e formatters compartilhados; `web/ai.js` permanece somente como boundary compatível. `ai-workspace.css` é canônico; `ai.css` foi removido.

## Navegação

Desktop mantém sidebar persistente.

Mobile mantém destinos primários:

- Painel;
- Análises;
- Gerar jogos;
- Meus Jogos;
- Mais.

`Mais` concentra Testes históricos, Laboratório, Estratégias, Execuções, Agenda e IA.

Controles icon-only mantêm nome acessível; disclosures suportam fechamento por teclado quando aplicável.

## Lazy loading e lifecycle

O shell e o app base carregam primeiro. Features são montadas por view.

Guardrails:

- Promises de asset são reutilizadas para evitar downloads/imports duplicados;
- a tentativa de CSS ocorre antes do módulo funcional quando a superfície depende do workspace final;
- features que ainda possuem fallback podem degradar para a implementação anterior; owners tipados exclusivos, como Backtests, exibem erro/retry explícito quando CSS ou módulo obrigatório falha;
- cada feature precisa ser idempotente e tolerar navegação repetida;
- listeners/observers/timers precisam de cleanup quando a feature deixa de ser dona da view;
- não usar montagem eager redundante quando o lifecycle já fornece evento de montagem;
- `loto-lab:view-rendered` só é emitido depois que o render principal deixa o loading; handoffs marcados com `data-feature-owned` não bloqueiam essa emissão porque o owner lazy precisa receber o evento para substituir o marcador;
- nome do evento, payload, leitura da view atual e subscribe/unsubscribe são centralizados em `web/src/core/viewLifecycle.ts`; `web/src/core/featureLoader.ts` consome esse contrato diretamente e `web/feature-loader.js` não redefine lifecycle nem carregamento.

O contrato compartilhado de lifecycle e o loader canônico já estão em TypeScript. Status de dados e as features migradas, incluindo o escopo do Painel, Meus Jogos, Análises, Gerador e Testes históricos, consomem esse core diretamente a partir de `web/src/features`. Dashboard Scope, Análises, Gerador e Backtests não mantêm parsing próprio da hash e usam `currentMainView`/`onMainViewChanged` para navegação/cleanup; o Painel também aborta leituras pendentes quando perde ownership. As camadas internas de readiness/explainability do Gerador também não registram hashchange nem conhecem a hash: `generationV2/enhancements.ts` concentra a espera pelo workspace e o cleanup dos observers. Backtests também não depende mais de `refinements.js` nem de uma segunda implementação em `app.js`. A #60 ainda deve migrar state/lifecycle internos do shell/app e de superfícies legadas restantes em fatias pequenas, eliminando duplicações quando houver ganho real de ownership; mover código de pasta sem reduzir ownership ou duplicação não é objetivo.

## Acessibilidade

Baseline:

- texto funcional >=16px;
- `focus-visible` consistente;
- controles com nome acessível;
- teclado em tabs/dialogs/drawers;
- `prefers-reduced-motion`;
- sem overflow horizontal estrutural no mobile;
- contraste coerente com tokens do Design System;
- loading/empty/error/success distinguíveis semanticamente e visualmente.

O browser E2E transversal do #143 repete a auditoria de legibilidade em desktop/mobile, usa `Tab` real para confirmar foco visível, emula `prefers-reduced-motion: reduce` e falha quando o documento mobile cria overflow horizontal.

## Segurança no frontend

- segredo nunca entra em asset web;
- dados externos devem preferir `textContent`/escaping seguro;
- `innerHTML` com conteúdo dinâmico precisa ser tratado como superfície de risco;
- o client HTTP compartilhado aceita apenas rotas relativas sob `/api/v1` e rejeita traversal/URLs absolutas antes de chamar `fetch`;
- mensagens do toast compartilhado usam `textContent`, nunca `innerHTML`;
- o frontend não deve replicar validação crítica como única defesa — invariantes continuam no backend/PostgreSQL.

A evolução para TypeScript/primitives compartilhadas é rastreada pela #60. A fundação TypeScript/formatters veio em #148; API client, errors, escaping, toast, contrato compartilhado de lifecycle e feature loader já foram migrados. Status de dados, Dashboard Scope, Agenda, IA, Estratégias, Execuções, Laboratório, Meus Jogos, Análises, Gerador e Testes históricos já possuem implementação canônica TypeScript; no Painel, custo/prêmio/resultado ausente não é transformado em zero e agregados financeiros incompletos permanecem indisponíveis. No Gerador, readiness/explainability também estão tipadas e o texto derivado do DOM usado no motivo de cada jogo é aplicado com `textContent`, sem reinterpolação dinâmica em `innerHTML`. Backtests já removeu também o fallback funcional duplicado. State/lifecycle do shell/app, novas primitives justificadas e decomposição dos módulos grandes continuam no escopo restante. Mudanças de jornada pertencem à #64.

## Trabalho pesado

Backtests, Strategy Lab e análise avançada usam workers/gates no backend. O frontend trata busy/timeout/erro como estados de produto, sem bloquear a navegação inteira.

## Performance percebida

O lifecycle, lazy loading e E2E atual protegem qualitativamente contra loading infinito, montagem duplicada, FOUC/layout inutilizável, navegação quebrada e overflow estrutural.

Medições quantitativas de LCP, INP e CLS e otimizações guiadas por baseline pertencem à #65. Fechar #121 não converte metas de Web Vitals em promessa sem medição representativa.

## Testes

`npm test` cobre build e contracts. O typecheck/lint inclui a área TypeScript do frontend. O CI também executa:

- Compose;
- imagem/smoke;
- autenticação;
- E2E em Chrome real;
- Security.

E2E local contra a aplicação em `5200`:

```bash
E2E_BASE_URL=http://127.0.0.1:5200 npm run e2e:browser
```

O E2E cobre superfícies principais, rotas críticas, legibilidade, desktop/mobile e fluxos operacionais.

Veja também [`PERFORMANCE.md`](PERFORMANCE.md), [`QUALITY.md`](QUALITY.md) e [`../AGENTS.md`](../AGENTS.md).
