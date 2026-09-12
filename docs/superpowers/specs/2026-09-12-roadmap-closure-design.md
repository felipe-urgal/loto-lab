# Fechamento consolidado do roadmap estrutural

Data: 2026-09-12

## Objetivo

Encerrar o roadmap estrutural atual em um único PR sem criar backlog paralelo nem fabricar trabalho para satisfazer issues antigas. O fechamento preserva os invariants existentes: algoritmo calcula; IA interpreta; anti-leakage; proveniência explícita; desconhecido diferente de zero; tuning somente com evidência.

## Escopo

O PR conclui #60, #64 e #66 por mudanças concretas de código, reconcilia #63 e #65 como capacidades operacionais contínuas já instaladas e registra #52 honestamente como configuração administrativa externa ao código. O tracker de execução é #270.

## 1. Proveniência hipótese → aplicação real → resultado real

`research_hypotheses` continua sendo a raiz canônica da hipótese e decisão; `backtest_runs` continua sendo a evidência canônica; `real_bets` continua sendo a identidade canônica da aplicação real e do resultado financeiro real. Não será criada tabela genérica de experimento/evidência nem snapshot duplicado.

Uma aposta real poderá carregar `research_hypothesis_id` opcional. O vínculo só será aceito quando:

- a hipótese existir;
- a hipótese estiver `decided`;
- a decisão for `applied-experimentally`;
- a loteria da hipótese, quando definida, for compatível com a aposta.

O vínculo será persistido por FK e exposto nas leituras de apostas reais. A API de pesquisa também permitirá listar as apostas reais associadas à hipótese, de modo que a cadeia possa ser percorrida nos dois sentidos sem identidade paralela.

O resultado real continua sendo reconciliado pelo fluxo existente de `real_bets`; assim, quando a aposta passa para `checked`, prêmio/custo/resultado permanecem no owner financeiro atual e ficam rastreáveis à hipótese pelo FK.

## 2. Jornada/contexto

Meus Jogos passa a aceitar um `researchHypothesisId` opcional no formulário de aposta real e a mostrar a proveniência quando uma aposta estiver vinculada. O ID é enviado ao backend e volta no registro persistido; nenhuma query string, hash, localStorage ou payload de resultado é usado como estado cruzado.

O contexto é progressivo: apostas normais continuam funcionando sem hipótese; vincular pesquisa é opcional e explícito. A UI não interpreta evidência nem recomenda apostar.

## 3. Último ownership relevante do frontend

`web/src/features/myGames.ts` ainda mantém filtro, consulta, lote expandido e token de request como estado imperativo local. Esse estado será extraído para `web/src/features/myGames/state.ts`, com interface pequena e testável. `myGames.ts` permanece composition root da feature e apenas coordena API, render e eventos.

Não haverá migração completa de `web/app.js`, framework novo ou decomposição por contagem de linhas. Renderers que já funcionam como composition roots permanecem onde estão.

## 4. Observabilidade e performance

#63 e #65 deixam de ser backlog estrutural após este PR. O produto já possui sinais, runbooks, `prod:resources`, profiling e protocolo de baseline. SLOs, índices, limites, timeouts, retries e tuning futuros só devem nascer de incidente/baseline concreto e, nesse momento, virar issue específica com evidência antes/depois.

Nenhum tuning será inventado neste PR.

## 5. Governança de main

A leitura atual da API confirma `main.protected = false`. O conector disponível nesta sessão não oferece escrita administrativa de branch protection. O PR não fingirá alterar isso: #52 será reconciliada como configuração administrativa externa ao código e encerrada como `not_planned` para o roadmap atual, deixando documentado que PR + CI continuam sendo o fluxo de engenharia recomendado.

## Persistência e compatibilidade

Será adicionada migration forward-only `015_research_real_bet_application.sql`. O novo campo é nullable para preservar todas as apostas existentes. Não haverá rewrite de dados históricos nem alteração de semântica financeira.

## Testes

A implementação seguirá TDD via CI do GitHub porque o ambiente desta sessão não resolve `github.com` para clone/npm. Primeiro serão adicionados testes que falham por ausência da feature e o draft PR será usado para observar o RED. Depois entra a implementação e o mesmo CI deve ficar GREEN.

Cobertura direcionada:

- use case/service de aposta real rejeita hipótese inexistente, decisão incompatível e loteria incompatível;
- repositório persiste e lê `researchHypothesisId`;
- pesquisa lista aplicações reais vinculadas;
- reconciliação de resultado não perde o vínculo;
- frontend inclui vínculo opcional e apresenta proveniência;
- owner de estado de Meus Jogos preserva filtro, expansão e stale-request guard;
- `npm run check` é o gate final.

## Documentação e encerramento

No mesmo PR serão reconciliados README, ROADMAP, API, DATABASE, FINANCIALS, WEB, OPERATIONS/RELIABILITY/PERFORMANCE e índice de tasks quando necessário. O roadmap deixa de listar trabalho estrutural ativo.

Após CI verde e revisão final no SHA exato, o PR fecha #60, #63, #64, #65, #66 e #270. #52 será atualizada e fechada separadamente como `not_planned`, com a razão administrativa e a confirmação de que a branch continua sem proteção.