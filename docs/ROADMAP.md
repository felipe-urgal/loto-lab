# Roadmap técnico e de produto

> Baseline reconciliada em **2026-09-09**, após o merge da #256/PR #257 e com a #258/PR #259 em characterization de dinâmica/ranking.
>
> Este documento é a fonte de verdade para **prioridade, dependências e estado atual** das issues estruturais. Detalhes de implementação e histórico pertencem às próprias issues/PRs e a `docs/tasks/`.

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
Decisão humana auditável
  ↓
Eventual geração/aposta real
  ↓
Resultado real
  ↓
Feedback auditável
```

Diretriz permanente:

> **Algoritmo calcula; IA interpreta.**

## Estado consolidado

### Capacidades já consolidadas

- PostgreSQL é a fonte de verdade operacional, com migrations forward-only, checksum e advisory lock;
- composition root HTTP centralizado em `src/api/server.ts` (#61 concluída);
- core estatístico, anti-leakage, geração reproduzível, Strategy Lab e financeiro auditável protegidos por testes;
- frontend em migração TypeScript incremental, com owners canônicos em `web/src` e boundaries JavaScript migrados import-only;
- observabilidade operacional cobre HTTP, Analysis Jobs, sync, pool PostgreSQL, CAIXA e OpenAI;
- pesquisa possui hipótese persistida, evidência canônica de backtest e decisão humana/auditável;
- produção possui `prod:resources` + protocolo documentado para baseline comparável antes de tuning;
- CI funcional, Security e E2E permanecem guardrails proporcionais ao risco.

### Entregas recentes relevantes

- #242 / #60 — apresentação de Execuções extraída para `web/src/features/jobs/presentation.ts`, preservando API/DOM/polling/cancelamento/lifecycle no owner original;
- #243 / #62 — estatística/combinatória pura extraída para `src/analysis/statistics.ts`, com reexports públicos e characterization preservados;
- #244 / #63 — runbooks operacionais para CAIXA, jobs, sync, PostgreSQL e OpenAI;
- #245 / #65 — protocolo reproduzível de baseline de CPU/memória;
- #246 / #66 — decisão humana/auditável de hipótese via API, com evidência obrigatória e escrita concorrente segura;
- #248 / #60 — Laboratório reutiliza o contexto compartilhado de loteria;
- #249 / #62 — characterization estrutural das três loterias e comportamento com gaps;
- #250 / #62 — owner de estrutura/filtros metodológicos em `src/analysis/structure.ts`;
- #251 / #62 — characterization pública de associações de pares/trincas, binomial bilateral exato, Bonferroni e highlights;
- #252 / #62 — owner de associações em `src/analysis/associations.ts`, preservando a characterization e o schema público;
- #253/#254 / #62 — characterization pública de ciclos e correção mínima de left-censoring, sem alterar dinâmica/ranking;
- #256/#257 / #62 — owner focado de ciclos em `src/analysis/cycles.ts`, preservando a characterization existente e mantendo `advanced.ts` como composition root;
- #258/PR #259 / #62 — characterization de dinâmica/ranking em execução antes de qualquer nova extração.

### Dívidas ativas reais

- `main` continua sem branch protection obrigatória (#52);
- frontend ainda possui state/lifecycle imperativo e módulos grandes em superfícies restantes (#60);
- `analysis/advanced.ts` foi reduzido por owners de continuidade, estatística, estrutura, associações e ciclos; dinâmica/ranking está sendo caracterizada na #258, enquanto rolling validation, similaridade e composição ainda permanecem no hotspot (#62);
- métricas e runbooks existem, mas ainda falta baseline observada suficiente para definir poucos SLOs úteis (#63);
- a jornada contextual ainda pode reduzir troca de contexto em Laboratório/proveniência/IA sem criar estado duplicado (#64);
- performance continua dependente de séries comparáveis antes/depois; nenhum tuning está autorizado por amostra isolada (#65);
- hipótese, evidência e decisão existem; o próximo passo da trilha científica é conectar aplicação/resultado real usando IDs canônicos, sem duplicar evidência (#66).

---

# Now

## #52 — Governança de `main` · P0 · bloqueada

Revalidado em **2026-09-06**: `main.protected = false` e não há required status checks aplicados pela proteção de branch.

**Próxima ação:** configuração administrativa no GitHub para exigir PR + `CI / test`, bloquear force-push/exclusão e então revalidar.

Esta tarefa não precisa de PR de código.

## #60 — Frontend TypeScript, módulos e primitives · P1 · em andamento

Entregue recentemente:

- #222 — guard de boundaries JavaScript import-only;
- #227 — contrato compartilhado de contexto principal;
- #234 — Agenda reutiliza identidade tipada de loteria;
- #242 — apresentação de Execuções separada do lifecycle, sem alterar jornada;
- #248 — Laboratório reutiliza o contexto compartilhado de loteria.

**Próximas fatias:**

- reduzir state/lifecycle imperativo nas superfícies restantes;
- decompor novos módulos grandes apenas por responsabilidade real;
- expandir `web/src/{core,features,shared}` quando houver contrato concreto;
- manter escaping/`textContent`, cleanup explícito e boundaries finos.

Não reabrir redesign visual nem iniciar rewrite/framework sem evidência.

## #63 — Métricas, SLOs e resposta operacional · P1 · em andamento

Entregue:

- #206 — HTTP por famílias de rota, taxas e p50/p95/p99;
- #212 — saúde persistida de Analysis Jobs;
- #217 — snapshot operacional de sync;
- #224 — pressão do pool PostgreSQL;
- #230 — requests/outcomes/latência da CAIXA;
- #235 — requests/outcomes/latência/tokens conhecidos da OpenAI;
- #244 — runbooks de incidentes usando esses sinais, sem thresholds inventados.

**Próxima fase:** observar baseline real de HTTP, jobs, sync, PostgreSQL, CAIXA e OpenAI e então definir poucos SLOs úteis para disponibilidade HTTP, sync e jobs.

Timeout/retry/backoff/pool/concorrência continuam fora de tuning até existir evidência suficiente.

---

# Next

## #62 — Motores e hotspots algorítmicos · P2 · em andamento

Entregue:

- #207 — espaços/baselines de planejamento;
- #208 — reporting/séries do Strategy Lab;
- #213 — constraints estruturais do gerador;
- #223 — plano de decomposição de `analysis/advanced.ts`;
- #228 — characterization de continuidade/gaps/left-censoring;
- #236 — owner de continuidade/qualidade;
- #243 — owner de estatística/combinatória compartilhada;
- #249 — characterization estrutural;
- #250 — owner de estrutura/filtros metodológicos;
- #251 — characterization de associações;
- #252 — owner de associações de pares/trincas;
- #253/#254 — characterization de ciclos, gaps, recuperação de fronteira e left-censoring;
- #256/#257 — owner de ciclos em `src/analysis/cycles.ts`, com guard de ownership e CI/review final verdes.

**Em execução:** #258/PR #259 caracteriza `result.ranking.dynamics` pelo boundary público sem mover runtime. A rede cobre desempates, offsets 1/5/10/20, movimentos/tendências, movers, tiers recentes, 243 cenários de robustez, delay/streak e fronteiras de gaps.

**Próxima decisão após a #258:** reavaliar se dinâmica/ranking forma uma seam coesa para owner próprio. Não extrair se for necessário misturar scoring, rolling validation, similaridade ou alterar expected values.

Rolling validation continua subordinada ao invariant anti-leakage e não deve ser movida por conveniência de tamanho de arquivo. Similaridade segue descritiva e só deve sair da composition root se houver ganho claro de ownership.

Qualquer mudança de score, threshold, janela, correção estatística, evidence level ou metodologia deve ser issue/PR separado.

## #64 — Arquitetura de informação e jornada pós-redesign · P2 · em andamento

Direção: **Protótipo A — contexto sem remoção de rotas**.

Entregue:

- #210 — jornada `Entender → Experimentar → Aplicar → Acompanhar → Operar`;
- #220 — Laboratório → Testes históricos;
- #225 — Análises → Laboratório/Gerador;
- #229 — Execuções → owners funcionais;
- #237 — retorno de backtest concluído por `jobId`;
- #239 — shape detalhado de backtest reconciliado sem fabricar `roundCount`.

**Próximas fatias:**

- avaliar retorno contextual do Laboratório apenas com identidade persistida suficiente;
- integrar proveniência da #66 quando isso reduzir troca de contexto sem estado duplicado;
- integrar IA a evidências/resultados sem esconder metodologia;
- revisar agrupamento global da navegação somente com evidência de uso.

## #65 — Runtime/Docker/performance baseada em evidência · P2 · em andamento

Guardrails existentes incluem runtime lock, graceful shutdown, hardening de container/rede, profiling PostgreSQL e `prod:resources`.

#245 consolidou o protocolo de baseline comparável: múltiplas observações, workload conhecido, release identificada, amostras brutas preservadas e critério explícito para evidência inconclusiva.

**Próximas decisões:**

- coletar séries reais de `prod:resources` sob cargas comparáveis;
- medir Web Vitals em ambiente representativo;
- justificar índices com profiling;
- medir heap/tempo antes de elevar concorrência;
- ajustar resiliência CAIXA/OpenAI somente a partir das baselines da #63.

Nenhum limite de CPU/memória, pool, timeout ou concorrência deve nascer apenas do protocolo.

## #66 — Hipótese → experimento → evidência → decisão · P2 · em andamento

Entregue:

- #226 — contrato mínimo de proveniência;
- #231 — raiz persistida `research_hypotheses`;
- #238 — vínculo de `backtest_run` como evidência canônica;
- #246 — decisão humana/auditável com evidência obrigatória e concorrência protegida.

Estado atual:

- hipótese tem ID/lifecycle estáveis;
- evidência continua no owner canônico `backtest_runs`;
- API cria/lista/lê hipóteses, associa/lista backtests e registra decisão humana;
- decisão exige justificativa e não pode ser sobrescrita por corrida concorrente;
- IA não cria nem decide hipótese e nenhum ranking/p-value promove lifecycle automaticamente.

**Próxima fatia:** conectar eventual aplicação/resultado real à cadeia de pesquisa usando IDs canônicos já existentes, sem criar `experiment_id`/`evidence_id` genérico ou snapshot opaco.

---

# Concluído estrutural

## #61 — Application use cases e controllers finos · concluída

Controllers de feature HTTP não compõem repositories/managers/providers concretos. `src/api/server.ts` é o composition root HTTP e `src/cli/apiStart.ts` permanece owner do lifecycle de processo/scheduler/recovery/drain.

---

# Ordem recomendada

```text
#52 branch protection (administrativo, independente)

#60 frontend TS/ownership
  ↓
#64 jornada/contexto

#63 baseline observada → poucos SLOs
  ↓
#65 tuning somente quando a medição justificar

#62 advanced.ts: caracterizar dinâmica/ranking (#258/#259)
  ↓
reavaliar owner de dinâmica somente após characterization verde

#66 aplicação/resultado real com proveniência canônica
```

Trabalhos independentes podem avançar em paralelo quando não compartilham owners/risco.

## Critério de pronto para refactor

Um refactor está pronto quando mantém comportamento salvo mudança explicitamente documentada e melhora pelo menos uma propriedade concreta:

- acoplamento;
- duplicação;
- testabilidade;
- ownership;
- estado explícito;
- risco operacional.

Mover arquivos sem ganho verificável não é progresso arquitetural.

## Gate mínimo

Toda mudança versionada passa por:

```bash
npm ci
npm run check
```

Validações adicionais seguem o risco conforme `AGENTS.md`. Todo PR próprio exige auto code review final no SHA verde antes do squash merge.

## Gestão documental

- `AGENTS.md` define invariantes e fluxo operacional estável;
- `docs/ROADMAP.md` mantém prioridade, estado e dependências atuais;
- docs técnicos descrevem contratos presentes;
- `docs/tasks/` preserva planos/decisões/registros de fatias específicas;
- issue da epic mantém backlog vivo e critérios de aceite;
- PR registra mudança concreta e validação.

O índice de `docs/tasks/` está em [`docs/tasks/README.md`](tasks/README.md).
