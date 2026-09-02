# Roadmap técnico e de produto

> Baseline revisada em **2026-09-02**, com #155–#160/#163/#175 já na `main`, composition root HTTP concluído e a modularização TypeScript do frontend avançando em fatias pequenas.
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
- Analysis Jobs extraídos de `analysisJobs.ts` para `AnalysisJobsUseCase`, com ports para fila, estratégias e histórico, preservando o lifecycle do manager em `apiStart.ts` e concluindo o composition root HTTP em `server.ts`.

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
- frontend ainda possui módulos grandes/imperativos; formatters, API client/errors, escaping e o contrato compartilhado de lifecycle já estão em TypeScript, mas state/lifecycle internos por feature, primitives e decomposição seguem ativos na #60;
- hotspots algorítmicos continuam grandes (#62);
- observabilidade segue baseada principalmente em logs/estado persistido, sem métricas/SLOs (#63);
- arquitetura de informação pós-redesign ainda pode reduzir troca de contexto (#64);
- otimizações operacionais e Web Vitals precisam de baseline antes/depois quando houver evidência (#65);
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

A consolidação visual da #121 foi concluída. O fallback financeiro foi alinhado ao contrato `desconhecido != zero` em #147, a fundação arquitetural TypeScript começou em #148 e a documentação canônica desse estado foi reconciliada em #149. O #175 moveu o client HTTP, `ApiError` e escaping compartilhado para TypeScript; a fatia atual centraliza também o contrato de lifecycle da view.

Entregue:

- `web/real-bets.js` preserva valor financeiro ausente como `—`, sem fabricar zero (#147);
- `tsconfig.web.json` isolando o ambiente browser/DOM (#148);
- typecheck/lint cobrindo `web/src/**/*.ts` (#148);
- emissão JavaScript via `tsc` para `web-dist/assets/src` sem publicar fontes `.ts` cruas (#148);
- `web/src/shared/formatters.ts` como primeiro helper compartilhado (#148);
- `web/runtime.js` preservado como boundary compatível para consumidores legados (#148);
- README/ROADMAP/WEB/MENTAL_MODEL reconciliados com a fundação incremental (#149);
- `web/src/core/api.ts` + `ApiError`, escaping compartilhado, regressões e hardening contra traversal/URLs absolutas (#175);
- `web/src/core/viewLifecycle.ts` como contrato único de view atual, evento renderizado, emissão e subscribe/unsubscribe; `feature-loader.js` consome o mesmo contrato sem redefinir hash/evento.

Próximas fatias:

- expandir `web/src/{core,design-system,features,shared}` conforme ownership real;
- state/lifecycle internos por feature, eliminando duplicações concretas de hash/cleanup;
- TypeScript por feature;
- decomposição de módulos grandes;
- escaping/`textContent` como padrão seguro;
- primitives reutilizáveis sem framework obrigatório.

O trabalho deve continuar sobre as fontes canônicas consolidadas, sem reabrir a #121 e sem big-bang de framework.

## #63 — Métricas e SLOs operacionais · P1

Transformar sinais já existentes em métricas acionáveis:

- latência/erros HTTP;
- jobs por estado/idade;
- sync e `partial`;
- CAIXA/OpenAI;
- pool PostgreSQL;
- poucos SLOs + runbooks.

Não introduzir tracing distribuído antes de necessidade demonstrada. Com a #61 concluída, #63 pode avançar sem depender de nova migração da fronteira HTTP, desde que não misture observabilidade com refactor algorítmico.

---

# Later / P2

## #62 — Motores e hotspots algorítmicos

Depois da consolidação principal da #61:

- registry por loteria quando houver contrato comum real;
- decompor `analysis/advanced.ts` e `generator/planning.ts`;
- separar Strategy Lab por experimento/inferência/reporting;
- absorver nomes transitórios `*-hardening` quando o ownership estiver claro;
- preservar equivalência matemática por testes.

A consolidação da #61 está concluída: facade temporária e ownership concreto dos controllers HTTP foram removidos. A decomposição da #62 pode avançar em fatias próprias sem reabrir a fronteira HTTP.

## #64 — Arquitetura de informação e jornada pós-redesign

O visual já foi unificado e consolidado. O próximo passo é decidir, com protótipos e tarefas reais:

- Testes históricos contextualizados no Laboratório;
- Execuções contextualizadas nos trabalhos de origem;
- IA integrada às evidências quando reduzir troca de contexto;
- percepção coerente entre hash routes e páginas dedicadas.

Jornada alvo: `Entender → Experimentar → Aplicar → Acompanhar → Operar`.

## #65 — Runtime/Docker/performance baseada em evidência

O baseline de hardening já é forte. Restam decisões medidas:

- Web Vitals/LCP/INP/CLS quando houver ambiente e medição representativa;
- redes/egress;
- `stop_grace_period`;
- logs/retenção;
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