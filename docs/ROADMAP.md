# Roadmap técnico e de produto

> Baseline revisada em **2026-09-05**, com as fatias #204–#214 e #216–#220 já na `main`, composition root HTTP concluído, frontend TypeScript avançando por owners canônicos, observabilidade operacional cobrindo HTTP/Analysis Jobs/sync e novos guardrails de produção/jornada integrados.
>
> Este documento é a fonte de verdade para prioridade, dependências e estado das issues estruturais. Detalhes de implementação pertencem às próprias issues/PRs.

## North Star

O Loto Lab deve tornar auditável o fluxo:

```text
Hipótese
  ↓
Estratégia/configuração versionada
  ↓
Experimento reproduzível
  ↓
Job auditável
  ↓
Evidência estatística/financeira
  ↓
Comparação com baseline/acaso
  ↓
Validação fora da amostra
  ↓
IA interpreta a evidência
  ↓
Decisão
  ↓
Eventual geração/aposta real
  ↓
Resultado real
  ↓
Feedback auditável
```

A diretriz permanece:

> **Algoritmo calcula; IA interpreta.**

## Estado consolidado

### Concluído desde a auditoria original

- redes de segurança de Analysis Jobs, IA e Operações (#54/#55);
- isolamento PostgreSQL da suíte (#56);
- contratos TypeScript ↔ PostgreSQL e upgrade de migrations (#57);
- hardening de CI/supply chain com CodeQL, Dependency Review, SBOM e Trivy (#58);
- frontend source-of-truth: PT-BR e legibilidade na fonte, sem runtime corretivo (#59);
- decisão do redesign/protótipo oficial (#120, concluída);
- rollout visual das superfícies principais (#123–#133);
- consolidação de CSS legado e ownership visual (#134–#142);
- auditoria transversal final de legibilidade, foco, reduced-motion e mobile, incluindo correção de overflow real em Análises (#143);
- consolidação do Protótipo 1 concluída (#121);
- correção do fallback financeiro para preservar `desconhecido != zero` (#147);
- fundação TypeScript incremental do frontend com `web/src`, typecheck/lint browser, emissão via `tsc` e primeiro helper compartilhado (#148);
- reconciliação da documentação frontend após a fundação TypeScript (#149);
- client HTTP, `ApiError` e escaping compartilhado migrados para `web/src`, com hardening de paths e boundary compatível em `runtime.js` (#175);
- contrato compartilhado de lifecycle da view centralizado em `web/src/core/viewLifecycle.ts`, mantendo o `feature-loader` como produtor e o runtime como boundary compatível;
- várias fatias da application layer (#106–#119);
- leitura de concursos extraída do monólito para controller/use case dedicado (#155);
- análise básica/avançada extraída de `app.ts` e da facade temporária (#156);
- ownership HTTP da geração compatível extraído para controller + `GenerateGamesUseCase` injetado (#157);
- ownership HTTP do Generator 2.0 extraído para controller + `GenerationV2UseCase`, com portas explícitas para histórico, previews/lotes e planner (#159);
- leitura, gestão e conferência de game batches extraídas do monólito/controllers concretos para `GameBatchUseCase` + `CheckGameBatchUseCase`, com composição em `server.ts` (#160);
- PR #163 remove a facade concreta `LotoLabApiServices` de `src/api/services.ts`, preservando somente exports auxiliares de compatibilidade;
- comparação de game batches extraída de `gameComparison.ts` para `CompareGameBatchUseCase`, com portas explícitas e composição em `server.ts`;
- Agenda/notificações extraídas de `agenda.ts` para `AgendaUseCase`, com portas mínimas para leitura, notificações e refresh e composição concreta em `server.ts`;
- IA interpretativa extraída de `aiInsights.ts` para `AiInsightsUseCase`, com portas para evidência, persistência e provider e composição de PostgreSQL/OpenAI em `server.ts`;
- Analysis Jobs extraídos de `analysisJobs.ts` para `AnalysisJobsUseCase`, com ports para fila, estratégias e histórico, preservando o lifecycle do manager em `apiStart.ts` e concluindo o composition root HTTP em `server.ts`;
- retenção local de logs dos containers limitada por rotação Docker e protegida pelo contrato de produção (#204);
- shell global com ownership funcional em `web/src/core/shell.ts` e `web/shell.js` reduzido a boundary compatível (#205);
- primeira baseline HTTP process-local com famílias de rota de cardinalidade fixa, error rates e p50/p95/p99 atrás da autenticação (#206);
- matemática do espaço de geração extraída de `generator/planning.ts` para owner próprio, preservando equivalência (#207);
- reporting/séries do Strategy Lab extraídos para owner próprio, preservando experimento e inferência no módulo canônico (#208);
- direção de arquitetura de informação consolidada no Protótipo A, preservando deep links/owners e definindo rollout contextual incremental (#210);
- grace period do container alinhado ao deadline máximo de shutdown da aplicação e protegido pelo Production Contract (#211);
- snapshot persistido de saúde da fila de Analysis Jobs adicionado ao endpoint operacional sem labels de alta cardinalidade (#212);
- validações estruturais de seleção/ranges extraídas de `generator/planning.ts` para `planningConstraints.ts`, preservando matemática e anti-leakage (#213);
- `web/app.js` passou a consumir API, escaping, formatters e toast dos owners TypeScript compartilhados, removendo as cópias locais (#214);
- PostgreSQL de produção passou a participar somente da rede interna `data`, enquanto `app` usa `data` + `egress`, com regressão protegida pelo Production Contract (#216);
- status operacional passou a expor snapshot de sync derivado de `operation_runs`, com `status`, `partial`, `running` e duração somente quando temporalmente válida (#217);
- refinements do Laboratório e refinements globais migraram para owners TypeScript, mantendo `web/lab-refinements.js` e `web/refinements.js` apenas como boundaries compatíveis (#218/#219);
- primeira fatia funcional do Protótipo A adicionou o CTA contextual Laboratório → Testes históricos sem estado cruzado, prefill ou promoção automática de estratégia (#220).

### Pontos fortes a preservar

- core estatístico e anti-leakage;
- PostgreSQL como fonte de verdade operacional;
- migrations forward-only com checksum e advisory lock;
- constraints/triggers de integridade de domínio;
- worker threads e gate conservador para CPU-bound;
- runtime single-instance explícito por banco;
- graceful startup/shutdown e recovery;
- container não-root/read-only com capabilities reduzidas;
- CI funcional + Security + browser E2E;
- IA restrita a interpretação auditável;
- Protótipo 1 aplicado e consolidado no produto inteiro;
- copy PT-BR e piso funcional de 16px pertencendo à fonte canônica;
- ownership visual explícito por workspace, preservando folhas funcionais/fallbacks apenas quando possuem responsabilidade real;
- caminho frontend TypeScript real, incremental e sem framework obrigatório, preservando o boundary JavaScript existente durante a migração.

### Dívidas ativas reais

- `main` continua sem branch protection obrigatória (#52);
- frontend ainda possui módulos grandes/imperativos; primitives compartilhadas, features canônicas, shell, `app.js` e os refinements globais/Lab já consomem owners TypeScript onde há ownership consolidado, mas state/lifecycle internos e superfícies legadas restantes seguem ativos na #60;
- hotspots algorítmicos continuam grandes apesar das extrações de espaço e validações do gerador e reporting do Strategy Lab (#62);
- observabilidade já possui baseline HTTP process-local, saúde persistida de Analysis Jobs e snapshot de sync com estados/duração; dependências externas, pool PostgreSQL, SLOs e runbooks seguem ativos na #63;
- a direção pós-redesign já foi decidida no Protótipo A e o primeiro link contextual Laboratório → Backtests está entregue; outros links úteis, retorno por `jobId` e proveniência entre superfícies seguem ativos na #64;
- retenção local de logs está bounded, o shutdown do container cobre o deadline máximo da aplicação e PostgreSQL não compartilha a rede de egress; otimizações operacionais e Web Vitals ainda precisam de baseline antes/depois quando houver evidência (#65);
- o fluxo hipótese → evidência → decisão ainda não é uma entidade explícita (#66).

---

# Now

## #52 — Governança de `main` · P0 · bloqueada

A API do GitHub foi revalidada em **2026-09-01**: `main.protected = false`, `required_status_checks.enforcement_level = off` e não há checks obrigatórios.

**Próxima ação:** configuração administrativa no GitHub/`gh api` para exigir PR + `CI / test`, bloquear force-push/exclusão e então revalidar.

Esta tarefa não precisa de PR de código.

## #61 — Application use cases e controllers finos · P1 · concluída

PRs #106–#119 construíram a base de application use cases. Em 2026-08-31, #155–#160 avançaram a etapa final do strangler:

- #155 moveu leitura de concursos para feature controller + `ContestCatalogUseCase`;
- #156 moveu análise básica/avançada para controller dedicado e retirou esses fluxos da facade;
- #157 moveu `POST /api/v1/games/generate` para controller dedicado com `GenerateGamesUseCase` composto em `server.ts`;
- #159 moveu o Generator 2.0 (`/generation/plan`, `/generation/preview`, `/generation/save`) para controller dedicado + `GenerationV2UseCase`, com PostgreSQL e worker concreto compostos em `server.ts`;
- #160 move leitura/conferência de game batches para controller dedicado, injeta `GameBatchUseCase` na gestão hide/show e remove `LotoLabApiServices` de `app.ts`;
- #163 remove a classe `LotoLabApiServices` e o acoplamento de `src/api/services.ts` a `pg`/repositories concretos, mantém no módulo apenas exports auxiliares compatíveis e adiciona guarda arquitetural contra regressão;
- a comparação de game batches agora passa por `CompareGameBatchUseCase`, deixando `gameComparison.ts` responsável apenas por HTTP/error mapping e movendo a composição concreta para `server.ts`;
- Agenda/notificações agora passam por `AgendaUseCase`, deixando `agenda.ts` responsável apenas por rota/parse/serialização e movendo repositories + `NotificationService` para `server.ts`;
- IA interpretativa agora passa por `AiInsightsUseCase`, deixando `aiInsights.ts` responsável por rota/parse/rate-limit/serialização e movendo provider + persistência para `server.ts`;
- Analysis Jobs agora passam por `AnalysisJobsUseCase`, deixando `analysisJobs.ts` responsável por transporte/error mapping e movendo manager, repositories e validação dependente do histórico para a application/composição.

Não resta controller de feature HTTP compondo repositories, managers ou providers concretos. `src/api/server.ts` é o composition root das features HTTP. O lifecycle de processo permanece corretamente separado: `src/cli/apiStart.ts` inicia/recover/draina o mesmo `AnalysisJobManager` singleton e continua dono do scheduler/runtime lock.

A revisão de CLI/scheduler não encontrou motivo para mover engines puros ou lifecycle de processo apenas por estética arquitetural; qualquer futura duplicação real deve ser tratada como necessidade nova e comprovada.

**Regra preservada:** a conclusão da #61 não inclui decomposição matemática da #62. Contratos HTTP/CLI, workers, cancelamento, gate e recovery permanecem cobertos pelos testes existentes e pelas guardas arquiteturais.

---

# Next

## #60 — Frontend TypeScript, módulos e primitives · P1 · em andamento

A consolidação visual da #121 foi concluída. O fallback financeiro foi alinhado ao contrato `desconhecido != zero` em #147, a fundação arquitetural TypeScript começou em #148 e a documentação canônica desse estado foi reconciliada em #149. O #175 moveu o client HTTP, `ApiError` e escaping compartilhado para TypeScript. Desde então, lifecycle/toast compartilhados e as features Status, Dashboard Scope, Agenda, IA, Estratégias, Execuções, Laboratório, Meus Jogos, Análises, Gerador e Testes históricos avançaram em fatias próprias; Painel, Meus Jogos, Análises e Gerador também explicitam contratos internos consumidos pela UI em owners menores. No Gerador, readiness e explainability possuem ownership TypeScript interno e lifecycle coordenado sem listeners/hash parsing paralelos. O Dashboard Scope também usa lifecycle/API compartilhados e separa a semântica financeira do owner de apresentação. A #205 moveu também o shell global para `web/src/core/shell.ts`, mantendo `web/shell.js` apenas como boundary de asset. A #214 eliminou as cópias locais de API, escaping, formatters e toast de `web/app.js`, que agora consome diretamente os owners canônicos já emitidos pelo build TypeScript. As #218/#219 moveram também os refinements do Laboratório e os refinements globais para owners TypeScript, mantendo os arquivos JavaScript públicos somente como boundaries de asset.

Entregue:

- `web/real-bets.js` preserva valor financeiro ausente como `—`, sem fabricar zero (#147);
- `tsconfig.web.json` isolando o ambiente browser/DOM (#148);
- typecheck/lint cobrindo `web/src/**/*.ts` (#148);
- emissão JavaScript via `tsc` para `web-dist/assets/src` sem publicar fontes `.ts` cruas (#148);
- `web/src/shared/formatters.ts` como primeiro helper compartilhado (#148);
- `web/runtime.js` preservado como boundary compatível para consumidores legados (#148);
- README/ROADMAP/WEB/MENTAL_MODEL reconciliados com a fundação incremental (#149);
- `web/src/core/api.ts` + `ApiError`, escaping compartilhado, regressões e hardening contra traversal/URLs absolutas (#175);
- `web/src/core/viewLifecycle.ts` como contrato único de view atual, evento renderizado, emissão e subscribe/unsubscribe; `feature-loader.js` consome o mesmo contrato sem redefinir hash/evento;
- primitive de toast com ownership em `web/src/shared/toast.ts` e consumo direto pelas features migradas;
- Status, Agenda, IA, Estratégias, Execuções e Laboratório com implementação funcional canônica em `web/src/features` e boundaries JavaScript compatíveis;
- Dashboard Scope com owner canônico em `web/src/features/dashboardScope.ts`, contratos e semântica financeira decompostos em `web/src/features/dashboardScope/`, consumo direto de API/escaping/formatters/toast/lifecycle, cancelamento de leituras stale ao perder a view e `web/dashboard-scope.js` reduzido a boundary compatível; custo/prêmio/resultado ausente não é convertido para zero e o ROI agregado fica indisponível quando os componentes financeiros necessários não são conhecidos;
- Meus Jogos com controller canônico em `web/src/features/myGames.ts`, contratos e responsabilidades de UI decompostos em `web/src/features/myGames/`, `web/my-games-v2.js` reduzido a boundary compatível e campos financeiros opcionais tipados sem coerção de ausência para zero;
- Análises 2.0 com implementação funcional canônica em `web/src/features/analysisV2.ts`, DTOs consumidos pela UI em `web/src/features/analysisV2/types.ts`, consumo direto de API/escaping/lifecycle compartilhados e `web/analysis-v2.js` reduzido a boundary compatível;
- Generator 2.0 com implementação funcional canônica em `web/src/features/generationV2.ts`, contratos de plano/auditoria/preview/save/estado em `web/src/features/generationV2/types.ts`, consumo direto de API/escaping/lifecycle compartilhados e `web/generation-v2.js` reduzido a boundary compatível;
- readiness de soma condicionada migrada de `web/generation-readiness.js` para `web/src/features/generationV2/readiness.ts`, preservando customização explícita do usuário e atualização via handlers do owner funcional;
- explainability/auditoria visual migrada de `web/generation-explainability.js` para `web/src/features/generationV2/explainability.ts`, preservando o fluxo de cinco etapas, guardrails de Lotofácil e textos anti-previsão; conteúdo derivado do DOM usado no motivo de cada jogo passa por `textContent`;
- `web/src/features/generationV2/enhancements.ts` coordena montagem/cleanup das duas camadas via lifecycle compartilhado; `feature-loader.js` deixa de carregá-las como módulos JS independentes e os dois assets legados são removidos;
- Testes históricos com implementação funcional canônica em `web/src/features/backtests.ts`, `web/backtests.js` reduzido a boundary, consumo direto de API/lifecycle/escaping/formatters/toast compartilhados, abort/stale-response guard e preservação do padrão de últimos 100 concursos;
- fallback funcional duplicado de Testes históricos removido de `web/app.js` + `refinements.js`; o app base mantém apenas um handoff de shell e `feature-loader.js` trata falha de asset do owner tipado com erro/retry explícito, sem restaurar implementação paralela;
- shell global com owner canônico em `web/src/core/shell.ts`, boundary fino em `web/shell.js` e contratos de navegação/hash/teclado/mobile preservados (#205);
- `web/app.js` consome `api`, escaping, formatters e toast dos owners TypeScript compartilhados e não redefine mais essas primitives; `safeApi` permanece como política local de degradação graciosa (#214);
- refinements globais possuem owner em `web/src/features/refinements.ts`, consomem API/lifecycle/escaping compartilhados e deixam `web/refinements.js` como boundary mínimo, preservando guards de cache/resposta stale e comportamento de Análises/Gerador/Meus Jogos (#219);
- refinements do Laboratório possuem owner em `web/src/features/labRefinements.ts`, com `web/lab-refinements.js` como boundary mínimo e contratos de desempate, auto-métrica e eixo preservados (#218).

Próximas fatias:

- expandir `web/src/{core,design-system,features,shared}` conforme ownership real;
- state/lifecycle internos das superfícies legadas restantes, eliminando duplicações concretas de hash/cleanup;
- avançar `app` e módulos grandes restantes em fatias pequenas, sem big-bang;
- decomposição dos módulos grandes ainda ativos;
- escaping/`textContent` como padrão seguro;
- primitives reutilizáveis sem framework obrigatório.

O trabalho deve continuar sobre as fontes canônicas consolidadas, sem reabrir a #121 e sem big-bang de framework.

## #63 — Métricas e SLOs operacionais · P1

A baseline HTTP foi entregue em #206: o processo Node mede requests, 4xx/5xx e latência p50/p95/p99 por famílias fixas de rota, com amostra bounded e endpoint operacional autenticado. A #212 acrescentou ao mesmo endpoint um snapshot persistido de `analysis_jobs`, com contagens fixas por estado e idade da fila mais antiga, sem dimensões de alta cardinalidade. A #217 acrescentou ao status operacional um snapshot de sync derivado do mesmo `operation_run` persistido, com conjunto fechado de estados, flags `partial`/`running` e `durationMs` somente quando início/fim são parseáveis e temporalmente válidos. Não existe uma segunda fonte de verdade em memória. A baseline HTTP continua process-local e nenhum desses sinais é apresentado como SLO final ou retenção histórica.

Próximas fatias:

- CAIXA/OpenAI;
- pool PostgreSQL;
- poucos SLOs + runbooks baseados nos sinais observados.

Não introduzir tracing distribuído antes de necessidade demonstrada. Com a #61 concluída, #63 pode avançar sem depender de nova migração da fronteira HTTP, desde que não misture observabilidade com refactor algorítmico.

---

# Later / P2

## #62 — Motores e hotspots algorítmicos

Depois da consolidação principal da #61:

- registry por loteria quando houver contrato comum real;
- decompor `analysis/advanced.ts` e fronteiras restantes de `generator/planning.ts`;
- separar Strategy Lab por experimento/benchmark/inferência quando houver owner coeso adicional;
- absorver nomes transitórios `*-hardening` quando o ownership estiver claro;
- preservar equivalência matemática por testes.

Já entregue em fatias pequenas:

- #207 extrai baseline condicional, combinação/DP e espaços algorítmicos para `generator/planningSpace.ts`, preservando `planning.ts` como orchestrator;
- #208 extrai séries e montagem de variantes para `lab/strategyLabReporting.ts`, preservando experimento, benchmark e inferência em `strategyLab.ts`;
- #213 extrai validação de seleção manual e ranges estruturais para `generator/planningConstraints.ts`, preservando mensagens, matemática, metodologia e anti-leakage.

A consolidação da #61 está concluída: facade temporária e ownership concreto dos controllers HTTP foram removidos. A decomposição da #62 pode avançar em fatias próprias sem reabrir a fronteira HTTP.

## #64 — Arquitetura de informação e jornada pós-redesign

A decisão de arquitetura foi entregue em #210. O **Protótipo A — contexto sem remoção de rotas** é a direção adotada: reduzir troca de contexto por links/proveniência sem fundir controllers, remover deep links ou transformar histórico em previsão.

Jornada alvo: `Entender → Experimentar → Aplicar → Acompanhar → Operar`.

A #220 entregou a primeira fatia funcional dessa direção: resultados visíveis do Laboratório oferecem `Testar historicamente` para a rota canônica `/#backtests`, sem query/hash state adicional, prefill de formulário, duplicação de controller ou promoção automática da estratégia melhor ranqueada.

Próximas fatias:

- ampliar links contextuais somente onde as rotas/owners atuais ofereçam transição útil sem estado cruzado obrigatório;
- `jobId` como retorno operacional com contrato único e deep link seguro;
- proveniência entre experimento/evidência para Laboratório ↔ Backtests/IA quando os dados já existirem;
- somente depois disso, revisar agrupamento da navegação global com evidência de uso.

## #65 — Runtime/Docker/performance baseada em evidência

O baseline de hardening já é forte. A #204 adicionou retenção local bounded para logs de `app` e `postgres` (`local`, `10m` × `5`) e um guard no contrato de produção. A #211 declarou `stop_grace_period: 130s` para o app e protege no Production Contract que essa janela permaneça maior que o máximo de 120s aceito pelo shutdown interno. A #216 separou a topologia de produção em uma rede `data` interna, compartilhada por `app` e PostgreSQL, e uma rede `egress` disponível apenas ao `app`; o Production Contract impede regressão dessa separação. São guardrails operacionais, não tuning de performance.

Restam decisões medidas:

- Web Vitals/LCP/INP/CLS quando houver ambiente e medição representativa;
- limites CPU/memória;
- cache de análise;
- índices PostgreSQL só após profiling;
- concorrência de worker só após medir heap/tempo;
- resiliência CAIXA conforme falhas reais.

O lifecycle atual e o browser E2E já funcionam como guardrails qualitativos contra FOUC, layout inutilizável, loading infinito, montagem duplicada e overflow estrutural. Otimização adicional exige evidência antes/depois.

## #66 — Hipótese → experimento → evidência → decisão

Compor as peças já existentes — strategies, jobs, backtests, Lab, previews/seeds, real bets e AI insights — em uma cadeia explícita de proveniência e decisão reproduzível.

A dependência de arquitetura da #61 está satisfeita. O desenho dessa camada transversal deve agora coordenar principalmente com a decomposição algorítmica da #62 para não criar ownership duplicado.

---

# Ordem recomendada

```text
#52 branch protection (administrativo, independente)

#60 frontend TS/primitives
  ↓
#64 jornada/arquitetura de informação

#61 application architecture (concluída)
  ├─→ #63 observabilidade
  └─→ #62 hotspots/motores
          ↓
        #66 fluxo científico

#65 pode avançar em fatias independentes quando houver medição
```

A #121 foi concluída e deixa de ser dependência ativa. A ordem não impede trabalhos paralelos que não compartilhem risco/arquivos, mas evita refactors concorrentes sobre a mesma fronteira.

## Critério de pronto para refactor

Um refactor está pronto quando mantém comportamento salvo mudança explicitamente documentada e melhora pelo menos uma propriedade concreta:

- acoplamento;
- duplicação;
- testabilidade;
- ownership;
- estado explícito;
- risco operacional.

Mover arquivos sem ganho verificável não é considerado progresso arquitetural.

### Gate mínimo

Backend:

- typecheck/static gates;
- testes + cobertura;
- PostgreSQL integration quando aplicável;
- Compose/imagem/smoke;
- E2E se a superfície pública mudar.

Frontend:

- typecheck/lint da área TypeScript migrada;
- desktop e mobile;
- teclado/foco;
- loading/empty/error/success;
- reduced-motion quando houver animação;
- browser E2E crítico.

Todos os PRs continuam exigindo **auto code review final no SHA verde** antes do squash merge. Agentes de IA devem seguir também o contrato operacional de [`AGENTS.md`](../AGENTS.md).

---

# Auditoria integral da documentação · 2026-09-01

Todos os **28 arquivos Markdown** versionados no branch do PR #163 foram revisados contra o estado atual do código, as 8 issues abertas e a `main` em `382f2a1`.

A auditoria confirmou que a maior parte do corpus já estava correta. Foram necessárias três correções materiais nesta rodada:

1. `docs/ROADMAP.md` — substitui a revisão pontual por esta auditoria integral, revalida #52 e reconcilia dependências/status de #60–#66;
2. `docs/REAL_BETS.md` — remove a dívida falsa sobre o fallback financeiro, corrigida em #147;
3. `docs/tasks/SENIOR_REVIEW_FINANCIAL_INTEGRITY.md` — registra o follow-up financeiro como absorvido e deixa de usar um review histórico concluído como backlog.

Os demais documentos foram lidos e mantidos sem churn porque continuam descrevendo corretamente contratos presentes.

| Documento | Resultado da auditoria |
| --- | --- |
| `AGENTS.md` | contrato de engenharia, PR, CI e auto-review permanece atual |
| `README.md` | estado, arquitetura, rollout e fundação TypeScript permanecem atuais |
| `docs/AGENDA.md` | contrato e application layer atuais de agenda/notificações |
| `docs/AI.md` | contexto, application layer, provider, persistência e limites metodológicos atuais |
| `docs/ANALYSES.md` | contrato estatístico/anti-leakage atual |
| `docs/API.md` | application layer e composition root HTTP completos atuais |
| `docs/DATABASE.md` | migrations, tabelas, repositories e invariantes atuais |
| `docs/DATA_OPERATIONS.md` | bootstrap/sync atuais |
| `docs/DEPLOYMENT.md` | stack e segurança de produção atuais |
| `docs/FINANCIALS.md` | ROI histórico/real e distinção `desconhecido != zero` atuais |
| `docs/GENERATION.md` | score-v2, portfólio e geração atuais |
| `docs/LOTOFACIL_READINESS.md` | checklist operacional atual |
| `docs/MENTAL_MODEL.md` | arquitetura backend/frontend e North Star atuais |
| `docs/METHODOLOGY.md` | score-v2, validação e Lab atuais |
| `docs/MY_GAMES.md` | My Games 2.0, lifecycle, conferência e comparação atuais |
| `docs/OPERATIONS.md` | reparo financeiro, agenda, notificações e status `partial` atuais |
| `docs/PERFORMANCE.md` | lazy loading, workers, PostgreSQL e política evidence-based atuais |
| `docs/PLATFORM.md` | Node 24.19.0 / TypeScript 7.x atuais |
| `docs/PRODUCTION-CONTRACT.md` | contrato `prod:*` atual |
| `docs/QUALITY.md` | gates CI/Security atuais |
| `docs/REAL_BETS.md` | corrigido: fallback também preserva `desconhecido != zero` desde #147 |
| `docs/RELIABILITY.md` | hardening e invariantes atuais |
| `docs/ROADMAP.md` | corrigido: auditoria integral, backlog e dependências reconciliados |
| `docs/STRATEGY_LAB.md` | contrato v2 e inferência atuais |
| `docs/WEB.md` | rollout concluído e migração TypeScript incremental atuais |
| `docs/design/PROTOTYPE_1_DARK_MODERN.md` | direção visual consolidada; #121 concluída |
| `docs/tasks/MY_GAMES_V2.md` | registro histórico concluído, sem backlog oculto |
| `docs/tasks/SENIOR_REVIEW_FINANCIAL_INTEGRITY.md` | corrigido: review concluído e follow-up financeiro absorvido por #147 |

## Gestão futura

- `AGENTS.md` define como agentes de IA devem trabalhar e revisar;
- README explica como usar/operar e aponta para documentos específicos;
- ROADMAP contém apenas prioridade/estado/dependência atuais;
- docs técnicos descrevem contratos presentes, não “milestones” antigos;
- `docs/tasks/` pode preservar decisões históricas, mas deve marcar explicitamente quando a tarefa estiver concluída;
- issues concluídas não permanecem abertas como documentação paralela;
- novos detalhes de execução entram nas issues/PRs, não como listas duplicadas no README.
