# Roadmap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encerrar o roadmap estrutural atual em um único PR, concluindo proveniência de pesquisa até aposta/resultado real, removendo o último hotspot de state/lifecycle de Meus Jogos e reconciliando todas as issues e docs ativos.

**Architecture:** `research_hypotheses` continua raiz de hipótese/decisão, `backtest_runs` continua evidência canônica e `real_bets` passa a carregar FK opcional para a hipótese quando a decisão é `applied-experimentally`. Meus Jogos permanece composition root, mas seu estado mutável sai para um owner TypeScript dedicado. Observabilidade/performance são encerradas como capacidades operacionais contínuas, sem tuning especulativo.

**Tech Stack:** Node.js 24.20.0, TypeScript 7.x, PostgreSQL 16, HTML/CSS/ES Modules, `node:test`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-12-roadmap-closure-design.md`

## Global Constraints

- Algoritmo calcula; IA interpreta.
- Anti-leakage e `desconhecido != zero` permanecem invariants bloqueantes.
- Nenhuma tabela genérica `experiment_id`/`evidence_id` nem snapshot paralelo.
- Nenhum framework/rewrite de frontend.
- Nenhum índice, timeout, retry, concorrência ou limite de recurso sem evidência comparável.
- Migration forward-only; migrations anteriores não são alteradas.
- `npm run check` deve ficar verde no SHA final.
- Auto code review final deve ocorrer no mesmo SHA verde antes do merge.

---

### Task 1: Congelar o contrato de aplicação real vinculada à hipótese

**Files:**
- Modify: `tests/realBetUseCase.test.ts`
- Create: `tests/researchHypothesisRealBetApplication.test.ts`
- Modify: `tests/informationArchitectureJourney.test.ts`

**Interfaces:**
- `CreateRealBetRequest.researchHypothesisId?: number`
- `RealBetSnapshot.researchHypothesisId: number | null`
- erros estáveis: `RESEARCH_HYPOTHESIS_NOT_FOUND`, `RESEARCH_HYPOTHESIS_NOT_APPLICABLE`, `RESEARCH_HYPOTHESIS_LOTTERY_MISMATCH`
- `ResearchHypothesisRealBetApplicationReader.listRealBets(hypothesisId)` retorna apostas reais canônicas vinculadas.

- [ ] **Step 1: Escrever testes RED de criação**

Adicionar casos em `realBetUseCase.test.ts` que exigem tradução dos três erros acima e preservação de `researchHypothesisId` no retorno de `create`.

- [ ] **Step 2: Escrever testes RED de rastreabilidade**

Criar `researchHypothesisRealBetApplication.test.ts` cobrindo: hipótese inexistente; hipótese `open`; decisão diferente de `applied-experimentally`; loteria incompatível; vínculo válido; listagem reversa da hipótese para apostas reais; aposta `checked` mantendo o mesmo `researchHypothesisId`.

- [ ] **Step 3: Escrever teste RED de jornada**

Ampliar `informationArchitectureJourney.test.ts` para exigir que o formulário de Meus Jogos possua campo opcional `researchHypothesisId`, que o payload enviado a `/real-bets` carregue esse ID somente quando informado e que a apresentação exponha a proveniência sem query/hash/localStorage.

- [ ] **Step 4: Publicar o commit RED e observar CI falhar pela feature ausente**

Commit: `test: caracterizar proveniência de aplicação real`

Esperado: typecheck/testes falham porque os contratos/campo/API ainda não existem. Não corrigir assertions para acomodar o estado atual.

---

### Task 2: Persistir a proveniência na identidade canônica de aposta real

**Files:**
- Create: `db/migrations/015_research_real_bet_application.sql`
- Modify: `src/persistence/realBetRepository.ts`
- Modify: `src/persistence/researchHypothesisRepository.ts`
- Modify: `src/realBets/service.ts`
- Modify: `src/application/realBets.ts`
- Modify: `src/application/researchHypotheses.ts`
- Modify: `src/api/realBets.ts`
- Modify: `src/api/researchHypotheses.ts`
- Modify: `src/api/server.ts`
- Modify as required by dependency typing: `src/api/routes.ts`

**Interfaces:**
- `real_bets.research_hypothesis_id BIGINT NULL REFERENCES research_hypotheses(id) ON DELETE RESTRICT`
- `CreateRealBetInput.researchHypothesisId?: number`
- `RealBetRecord.researchHypothesisId: number | null`
- `PostgresRealBetRepository.listByResearchHypothesisId(hypothesisId: number, limit?: number)`
- `ResearchHypothesisRealBetApplicationReader.listRealBets(hypothesisId: number)`
- `ResearchHypothesesUseCase.listRealBetApplications(hypothesisId)`
- API `GET /api/v1/research/hypotheses/:id/applications/real-bets`

- [ ] **Step 1: Criar migration mínima**

Adicionar somente a coluna nullable e FK `ON DELETE RESTRICT`. Não criar índice sem profiling.

- [ ] **Step 2: Fazer o repositório de real bets persistir e ler o FK**

Incluir `research_hypothesis_id` nos SELECTs/INSERTs e mapear para `researchHypothesisId`. Implementar listagem reversa por hipótese com limite bounded usando o mesmo mapper de `RealBetRecord`.

- [ ] **Step 3: Validar a hipótese antes de criar a aposta**

Em `RealBetService.create`, quando `researchHypothesisId` existir, buscar a hipótese e rejeitar com mensagens estáveis quando inexistente, não decidida como `applied-experimentally` ou incompatível com a loteria do lote. Passar o ID validado ao repositório.

- [ ] **Step 4: Traduzir erros no application use case e HTTP**

Adicionar os três códigos ao `RealBetUseCaseError`, traduzir as mensagens do service e mapear `not found` para 404, decisão/loteria incompatível para 409/400 coerente com o contrato atual.

- [ ] **Step 5: Expor listagem reversa na pesquisa**

Adicionar o reader de aplicações ao `ResearchHypothesesUseCase`, validar existência da hipótese antes de listar e registrar a rota dedicada em `researchHypotheses.ts`. Compor `PostgresRealBetRepository` em `server.ts` sem criar facade nova.

- [ ] **Step 6: Rodar/observar GREEN dos testes direcionados no CI**

Esperado: novos testes de proveniência passam; testes existentes de aposta real/pesquisa continuam verdes.

- [ ] **Step 7: Commit**

Commit: `feat(research): ligar hipótese a aposta e resultado real`

---

### Task 3: Integrar proveniência em Meus Jogos sem estado paralelo

**Files:**
- Modify: `web/src/features/myGames/betForm.ts`
- Modify: `web/src/features/myGames/types.ts`
- Modify: `web/src/features/myGames/presentation.ts`
- Test: `tests/informationArchitectureJourney.test.ts`
- Test/update architectural tests if necessary: `tests/myGamesWorkspace.test.ts`

**Interfaces:**
- formulário: input opcional `name="researchHypothesisId"`, inteiro positivo;
- POST `/real-bets`: `{ batchId, contestNumber, actualCost, gamePositions, researchHypothesisId? }`;
- `RealBet.researchHypothesisId?: number | null`;
- apresentação textual neutra: `Hipótese #<id>` somente quando persistida.

- [ ] **Step 1: Implementar o campo opcional no formulário**

Adicionar label de pesquisa/aplicação experimental com copy explícita de que o vínculo não altera probabilidade e só deve ser usado para hipótese já decidida para aplicação experimental.

- [ ] **Step 2: Construir payload sem estado paralelo**

Ler o campo via `FormData`; incluir `researchHypothesisId` apenas se inteiro positivo. Não persistir em localStorage/hash/query.

- [ ] **Step 3: Expor proveniência no card da aposta**

Tipar `researchHypothesisId` e renderizar identificação da hipótese quando presente, sem inferir qualidade/recomendação.

- [ ] **Step 4: Verificar testes de jornada no CI**

Esperado: `informationArchitectureJourney.test.ts` e testes de Meus Jogos verdes.

- [ ] **Step 5: Commit**

Commit: `feat(web): exibir proveniência de apostas experimentais`

---

### Task 4: Extrair o último estado imperativo relevante de Meus Jogos

**Files:**
- Create: `web/src/features/myGames/state.ts`
- Modify: `web/src/features/myGames.ts`
- Create: `tests/myGamesState.test.ts`
- Modify if needed: `tests/webTypedBoundaries.test.ts`

**Interfaces:**
```ts
export type MyGamesUiSnapshot = {
  filter: MyGamesFilter;
  query: string;
  expandedBatchId: number | null;
};

export type MyGamesUiState = {
  snapshot(): MyGamesUiSnapshot;
  setFilter(filter: MyGamesFilter): void;
  setQuery(query: string): void;
  toggleExpanded(batchId: number): void;
  setExpanded(batchId: number | null): void;
  resetForLotteryChange(): void;
  beginRequest(): number;
  isCurrentRequest(token: number): boolean;
};

export function createMyGamesUiState(): MyGamesUiState;
```

- [ ] **Step 1: Escrever RED do owner de estado**

Cobrir defaults, filtro, query, toggle/expanded, reset de loteria e invalidação de request stale.

- [ ] **Step 2: Observar RED no CI**

Esperado: falha porque `state.ts` ainda não existe.

- [ ] **Step 3: Implementar owner mínimo**

Manter estado privado no closure; `snapshot()` devolve objeto novo; `beginRequest()` incrementa token; `isCurrentRequest()` compara token sem expor contador mutável.

- [ ] **Step 4: Migrar `myGames.ts` para o owner**

Remover `UiState` local e mutações diretas de `filter/query/expandedBatchId/requestToken`. `myGames.ts` continua responsável por bind, API, render e lifecycle.

- [ ] **Step 5: Verificar GREEN no CI**

Esperado: novo unit test e gates arquiteturais verdes, comportamento visual preservado.

- [ ] **Step 6: Commit**

Commit: `refactor(web): fechar ownership de estado em Meus Jogos`

---

### Task 5: Reconciliar contratos técnicos e encerrar o roadmap

**Files:**
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/API.md`
- Modify: `docs/DATABASE.md`
- Modify: `docs/FINANCIALS.md`
- Modify: `docs/WEB.md`
- Modify: `docs/OPERATIONS.md`
- Modify: `docs/RELIABILITY.md`
- Modify: `docs/PERFORMANCE.md`
- Modify: `docs/tasks/README.md`
- Delete before final diff if no durable value: `docs/superpowers/specs/2026-09-12-roadmap-closure-design.md`, `docs/superpowers/plans/2026-09-12-roadmap-closure.md`

- [ ] **Step 1: Atualizar contratos presentes**

Documentar migration 015, `researchHypothesisId`, rota de aplicações reais, fluxo de Meus Jogos e cadeia auditável completa até resultado real.

- [ ] **Step 2: Fechar #60/#64/#66 no estado documental**

ROADMAP deixa de listar essas issues como trabalho ativo e registra que owners/deep links/proveniência necessários ao escopo estrutural estão consolidados; novos problemas concretos devem nascer como issues específicas.

- [ ] **Step 3: Transformar #63/#65 em política operacional**

Registrar que sinais/runbooks/baselines/profiling são capacidades permanentes. Tuning/SLO futuro só vira trabalho quando existir evidência observada; não manter issue aberta esperando um incidente ou baseline indefinido.

- [ ] **Step 4: Registrar #52 sem maquiar estado**

Documentar que a branch protection segue dependente de configuração administrativa e não pertence ao código. Não afirmar `protected=true`.

- [ ] **Step 5: Remover docs temporários de execução**

Se spec/plan não tiverem valor durável após o merge, removê-los para preservar a política documental do projeto; o histórico permanece nos commits/PR/#270.

- [ ] **Step 6: Commit**

Commit: `docs: encerrar roadmap estrutural atual`

---

### Task 6: Gate final, revisão, merge e fechamento das issues

**Files:** nenhum arquivo novo além de correções encontradas pelo gate/review.

- [ ] **Step 1: Atualizar branch com `main` se necessário**

A branch deve chegar ao review final 0 commits atrás, sem force-push sobre SHA já revisado sem repetir gates.

- [ ] **Step 2: Executar CI canônico**

`npm run check` via GitHub Actions deve estar verde no SHA final. Gates adicionais existentes do repositório devem permanecer verdes.

- [ ] **Step 3: Auto code review final**

Revisar o diff completo contra `main` no SHA verde, priorizando proveniência, lifecycle, migration, desconhecido!=zero, anti-leakage e ausência de estado paralelo. Corrigir qualquer finding e reiniciar gates/review em novo SHA.

- [ ] **Step 4: Merge do PR único**

Merge somente o SHA revisado/verde.

- [ ] **Step 5: Reconciliar issues**

Fechar #60, #63, #64, #65, #66 e #270 como `completed`, com comentário apontando para o PR final e decisão de escopo. Atualizar #52 com a leitura final de `main.protected`; se continuar false, fechar como `not_planned` explicitando que é configuração administrativa externa ao roadmap de código, não uma proteção aplicada.

- [ ] **Step 6: Verificar estado final**

Confirmar nenhum PR aberto desse fechamento, nenhum roadmap estrutural ativo indevidamente e documentação canônica coerente com `main` após merge.