# Roadmap técnico e de produto

> Baseline revisada em **2026-08-30**, após o merge do #148 (`255919a`).
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
- fundação TypeScript incremental do frontend com `web/src`, typecheck/lint browser, emissão via `tsc` e primeiro helper compartilhado (#148);
- várias fatias da application layer (#106–#119).

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
- `src/api/app.ts` e `LotoLabApiServices` ainda concentram parte do ownership HTTP/infra (#61);
- frontend ainda possui módulos grandes/imperativos; a fundação TypeScript existe desde #148, mas API client/errors/escaping/lifecycle/state, primitives e decomposição por feature seguem ativos na #60;
- hotspots algorítmicos continuam grandes (#62);
- observabilidade segue baseada principalmente em logs/estado persistido, sem métricas/SLOs (#63);
- arquitetura de informação pós-redesign ainda pode reduzir troca de contexto (#64);
- otimizações operacionais e Web Vitals precisam de baseline antes/depois quando houver evidência (#65);
- o fluxo hipótese → evidência → decisão ainda não é uma entidade explícita (#66).

---

# Now

## #52 — Governança de `main` · P0 · bloqueada

A API do GitHub foi revalidada em 2026-08-30: `main.protected = false` e não há required status checks.

**Próxima ação:** configuração administrativa no GitHub/`gh api` para exigir PR + `CI / test`, bloquear force-push/exclusão e então revalidar.

Esta tarefa não precisa de PR de código.

## #61 — Application use cases e controllers finos · P1 · em andamento

PRs #106–#119 já extraíram análise, geração compatível, conferência, backtest, Strategy Lab, estratégias, operações, apostas reais e status de dados em várias fatias.

Restam principalmente:

- concursos e análises ainda em `app.ts`;
- Generator 2.0 e geração compatível ainda roteados pelo monólito;
- game batches/conferência remanescentes;
- redução/remoção final de `LotoLabApiServices` como facade de infrastructure;
- composition root explícito para todas as features migradas.

**Regra:** continuar verticalmente, sem misturar decomposição matemática da #62.

---

# Next

## #60 — Frontend TypeScript, módulos e primitives · P1 · em andamento

A consolidação visual da #121 foi concluída e a fundação arquitetural começou em #148.

Entregue em #148:

- `tsconfig.web.json` isolando o ambiente browser/DOM;
- typecheck/lint cobrindo `web/src/**/*.ts`;
- emissão JavaScript via `tsc` para `web-dist/assets/src` sem publicar fontes `.ts` cruas;
- `web/src/shared/formatters.ts` como primeiro helper compartilhado;
- `web/runtime.js` preservado como boundary compatível para consumidores legados.

Próximas fatias:

- expandir `web/src/{core,design-system,features,shared}` conforme ownership real;
- API client/errors/escaping/lifecycle/state compartilhados;
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

Não introduzir tracing distribuído antes de necessidade demonstrada.

---

# Later / P2

## #62 — Motores e hotspots algorítmicos

Depois da #61:

- registry por loteria quando houver contrato comum real;
- decompor `analysis/advanced.ts` e `generator/planning.ts`;
- separar Strategy Lab por experimento/inferência/reporting;
- absorver nomes transitórios `*-hardening` quando o ownership estiver claro;
- preservar equivalência matemática por testes.

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

---

# Ordem recomendada

```text
#52 branch protection (administrativo, independente)

#60 frontend TS/primitives
  ↓
#64 jornada/arquitetura de informação

#61 application architecture
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

# Auditoria da documentação · 2026-08-30

Todos os **27 arquivos Markdown** versionados foram revisados contra a `main` após #137. O estado do rollout visual e das prioridades foi reconciliado após #143 para encerrar #121 e novamente após #148 para registrar a fundação TypeScript da #60 sem tratar o restante da modularização como concluído.

| Documento | Resultado da auditoria |
| --- | --- |
| `AGENTS.md` | contrato de engenharia, PR, CI e auto-review para agentes de IA |
| `README.md` | estado, rollout concluído, arquitetura e fundação TypeScript incremental |
| `docs/AGENDA.md` | URL local e contrato atual |
| `docs/AI.md` | contexto/persistência atuais e URL local |
| `docs/ANALYSES.md` | contrato estatístico atual |
| `docs/API.md` | application layer e famílias atuais |
| `docs/DATABASE.md` | migrations/tabelas/repositories atuais |
| `docs/DATA_OPERATIONS.md` | bootstrap/sync atuais |
| `docs/DEPLOYMENT.md` | stack e segurança atuais |
| `docs/FINANCIALS.md` | ROI histórico/real, `financialCost`/`checkedCost` e compatibilidade JSON |
| `docs/GENERATION.md` | score-v2 e geração atuais |
| `docs/LOTOFACIL_READINESS.md` | checklist atual |
| `docs/MENTAL_MODEL.md` | application layer, superfícies e fundação frontend TypeScript |
| `docs/METHODOLOGY.md` | score-v2/Lab implementados |
| `docs/MY_GAMES.md` | My Games 2.0, ocultar/mostrar, conferência e comparação |
| `docs/OPERATIONS.md` | reparo financeiro, agenda, notificações e status `partial` |
| `docs/PERFORMANCE.md` | workspaces, cascata, lazy loading, workers, E2E e metas medidas |
| `docs/PLATFORM.md` | Node 24.19.0 / TS 7.x |
| `docs/QUALITY.md` | CI/Security atuais |
| `docs/REAL_BETS.md` | anti-hindsight, `checkedCost`, revisões financeiras e integração com Meus Jogos |
| `docs/RELIABILITY.md` | hardening atual |
| `docs/ROADMAP.md` | backlog real, #121 concluída e #60 em execução após #148 |
| `docs/STRATEGY_LAB.md` | contrato v2 atual |
| `docs/WEB.md` | rollout/consolidação concluídos, ownership atual e build TypeScript incremental |
| `docs/design/PROTOTYPE_1_DARK_MODERN.md` | direção visual consolidada; #121 concluída |
| `docs/tasks/MY_GAMES_V2.md` | registro histórico/concluído e owners atuais |
| `docs/tasks/SENIOR_REVIEW_FINANCIAL_INTEGRITY.md` | registro histórico/concluído e follow-up absorvido |

## Gestão futura

- `AGENTS.md` define como agentes de IA devem trabalhar e revisar;
- README explica como usar/operar e aponta para documentos específicos;
- ROADMAP contém apenas prioridade/estado/dependência atuais;
- docs técnicos descrevem contratos presentes, não “milestones” antigos;
- `docs/tasks/` pode preservar decisões históricas, mas deve marcar explicitamente quando a tarefa estiver concluída;
- issues concluídas não permanecem abertas como documentação paralela;
- novos detalhes de execução entram nas issues/PRs, não como listas duplicadas no README.
