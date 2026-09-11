# Roadmap técnico e de produto

> Baseline reconciliada em **2026-09-11**. Este documento registra apenas trabalho estrutural ainda ativo e decisões concluídas que continuam relevantes. Histórico detalhado fica em issues, PRs, commits e testes.

## North Star

O Loto Lab deve tornar auditável o fluxo:

```text
Hipótese → estratégia/configuração versionada → experimento reproduzível
→ evidência estatística/financeira → decisão humana auditável
→ eventual aplicação/aposta real → resultado real → feedback
```

Diretriz permanente: **algoritmo calcula; IA interpreta**.

---

# Now

## #52 — Governança de `main` · P0 · bloqueada

`main` continua sem proteção obrigatória. Esta issue depende de configuração administrativa no GitHub, não de código.

**Próxima ação:** exigir PR + `CI / test`, bloquear force-push/exclusão e revalidar a configuração.

## #60 — Frontend TypeScript e ownership · P1 · em andamento

A fundação TypeScript, core compartilhado e vários owners funcionais já existem.

**Próximo foco:** reduzir state/lifecycle imperativo e decompor módulos grandes somente quando houver responsabilidade real. Sem rewrite/framework por preferência e sem novo redesign visual sem decisão explícita.

## #63 — Observabilidade orientada a SLOs · P1 · em andamento

HTTP, jobs, sync, PostgreSQL, CAIXA e OpenAI já possuem sinais e runbooks.

**Próximo foco:** coletar baseline real e só então definir poucos SLOs úteis e qualquer tuning de timeout/retry/backoff/pool/concorrência.

---

# Next

## #64 — Jornada e contexto pós-redesign · P2 · em andamento

Direção: contexto entre superfícies usando identidades canônicas/deep links, sem estado paralelo.

**Próximo foco:** reduzir troca de contexto apenas quando houver identidade persistida suficiente; integrar proveniência/IA sem esconder metodologia nem duplicar owners.

## #65 — Runtime e performance baseada em evidência · P2 · em andamento

Hardening estrutural e protocolo de baseline já existem.

**Próximo foco:** coletar séries comparáveis de CPU/memória, Web Vitals, profiling PostgreSQL e comportamento de workers/providers antes de qualquer tuning.

## #66 — Hipótese → evidência → decisão → aplicação · P2 · em andamento

Hipótese persistida, evidência canônica de backtest e decisão humana/auditável já existem.

**Próximo foco:** conectar eventual aplicação/resultado real usando IDs canônicos existentes, sem `experiment_id`/`evidence_id` genérico nem snapshot opaco.

---

# Concluído estrutural

## #61 — Application use cases e controllers finos

Concluída. `src/api/server.ts` é o composition root HTTP; controllers não compõem infraestrutura concreta.

## #62 — Motores e hotspot `analysis/advanced.ts`

Concluída com a #264/PR #265.

Owners canônicos:

- `continuity.ts` — continuidade/gaps/qualidade;
- `statistics.ts` — estatística/combinatória compartilhada;
- `structure.ts` — estrutura/filtros metodológicos;
- `associations.ts` — pares/trincas e inferência;
- `cycles.ts` — ciclos;
- `dynamics.ts` — ranking/dinâmica/robustez;
- `validation.ts` — rolling validation anti-leakage.

`advanced.ts` permanece composition root. A similaridade histórica fica nele de propósito: hoje é composição local, sem consumidor independente ou boundary própria; extrair apenas para reduzir linhas não gera ganho de ownership.

Detalhes duráveis: [`tasks/ADVANCED_ANALYSIS_DECOMPOSITION_PLAN.md`](tasks/ADVANCED_ANALYSIS_DECOMPOSITION_PLAN.md).

---

# Ordem recomendada

```text
#52 branch protection (administrativo)

#60 frontend ownership
  ↓
#64 jornada/contexto

#63 baseline observada
  ↓
#65 tuning somente com evidência

#66 aplicação/resultado real com proveniência canônica
```

Trabalhos independentes podem avançar em paralelo quando não compartilham owner ou risco.

## Critério para refactor

Refactor só vale quando preserva comportamento e melhora uma propriedade concreta: ownership, acoplamento, duplicação, testabilidade, estado explícito ou risco operacional. Mover arquivo apenas para reduzir linhas não é progresso arquitetural.

## Gate mínimo

```bash
npm ci
npm run check
```

Validações adicionais seguem `AGENTS.md`. Todo PR próprio exige auto code review final no SHA verde antes do squash merge.

## Gestão documental

- `AGENTS.md` — invariantes e fluxo operacional estável;
- `README.md` — visão atual do produto;
- `docs/ROADMAP.md` — prioridades e estado estrutural atual;
- docs técnicos — contratos presentes;
- `docs/tasks/` — somente contratos, planos ativos e guias que continuem úteis após o merge;
- issues/PRs/commits/testes — histórico de execução.
