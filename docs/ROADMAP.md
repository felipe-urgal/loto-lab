# Roadmap técnico e de produto

> Baseline reconciliada em **2026-09-12**. O roadmap estrutural iniciado nas issues #52, #60–#66 está encerrado. Histórico detalhado permanece em issues, PRs, commits e testes; este documento registra a arquitetura resultante e as regras para trabalho futuro.

## North Star

O Loto Lab torna auditável o fluxo:

```text
Hipótese → estratégia/configuração versionada → experimento reproduzível
→ evidência estatística/financeira → decisão humana auditável
→ eventual aplicação/aposta real → resultado real → feedback
```

Diretriz permanente: **algoritmo calcula; IA interpreta**.

---

# Baseline concluída

## Governança de `main` · #52

A governança por PR + CI continua sendo o fluxo recomendado de engenharia. A leitura administrativa mais recente ainda mostra `main.protected = false`; branch protection depende de configuração do GitHub e não de código deste repositório.

A issue deixa de fazer parte do roadmap estrutural de código. Se a proteção for habilitada no futuro, a validação deve confirmar `main.protected = true` e o check obrigatório real; não registrar proteção aplicada enquanto isso não for verdade.

## Frontend TypeScript e ownership · #60

A evolução incremental está concluída para o escopo estrutural atual:

- core compartilhado tipado para API, contexto principal, shell, lifecycle, lazy loading e render state;
- features principais possuem owners canônicos em `web/src/features`;
- boundaries JavaScript migrados permanecem finos/import-only;
- Meus Jogos separa apresentação, comparação, formulário/auditabilidade e estado de UI; filtro, busca, expansão e stale-request guard pertencem a `myGames/state.ts`;
- composição de tela continua nos roots existentes quando não há boundary independente que justifique extração.

Não existe objetivo de converter cada arquivo por contagem de linhas. Novo refactor só deve nascer de hotspot concreto de ownership, estado, acoplamento ou testabilidade.

## Observabilidade operacional · #63

HTTP, Analysis Jobs, sync, PostgreSQL, CAIXA e OpenAI possuem sinais de baixa cardinalidade e runbooks associados. O trabalho estrutural está concluído.

SLO, timeout, retry, backoff, pool ou concorrência futuros devem nascer de um incidente ou baseline real e virar uma issue específica com evidência observada. Não manter epic aberto aguardando indefinidamente dados de produção.

## Jornada e contexto · #64

As superfícies críticas compartilham contexto por identidades canônicas e deep links, sem copiar resultado por query/hash/localStorage. A proveniência de pesquisa agora alcança a aplicação real pela própria identidade de `real_bets`.

Melhorias futuras de jornada devem nascer de fricção observável, não de um backlog genérico de redesign.

## Runtime e performance · #65

O hardening estrutural, `prod:resources`, profiling de banco, Web Vitals/worker observability e protocolo de baseline formam a capacidade permanente de performance.

Índice, cache, timeout, concorrência e limite de recurso continuam proibidos sem comparação antes/depois sob workload equivalente. Quando uma medição revelar gargalo concreto, abrir uma issue pequena com baseline e critério de sucesso em vez de reabrir um epic permanente.

## Hipótese → evidência → decisão → aplicação → resultado · #66

A cadeia está completa usando owners canônicos:

- `research_hypotheses` — hipótese e decisão humana;
- `research_hypothesis_backtest_evidence` → `backtest_runs` — evidência reproduzível;
- decisão `applied-experimentally` — autorização explícita para aplicação controlada;
- `real_bets.research_hypothesis_id` — aplicação real opcional;
- reconciliação da mesma `real_bet` — resultado financeiro real posterior.

Não existe `experiment_id`/`evidence_id` genérico nem snapshot paralelo de resultado. Hipóteses não aplicáveis, loterias incompatíveis e IDs inexistentes são rejeitados antes da persistência da aposta.

---

# Decisões estruturais preservadas

## #61 — Application use cases e controllers finos

`src/api/server.ts` é o composition root HTTP; controllers não compõem infraestrutura concreta.

## #62 — Motores e hotspot `analysis/advanced.ts`

Owners canônicos:

- `continuity.ts` — continuidade/gaps/qualidade;
- `statistics.ts` — estatística/combinatória compartilhada;
- `structure.ts` — estrutura/filtros metodológicos;
- `associations.ts` — pares/trincas e inferência;
- `cycles.ts` — ciclos;
- `dynamics.ts` — ranking/dinâmica/robustez;
- `validation.ts` — rolling validation anti-leakage.

`advanced.ts` permanece composition root. A similaridade histórica continua nele enquanto for composição local sem consumidor/boundary independente.

Detalhes duráveis: [`tasks/ADVANCED_ANALYSIS_DECOMPOSITION_PLAN.md`](tasks/ADVANCED_ANALYSIS_DECOMPOSITION_PLAN.md).

---

# Política para trabalho futuro

Nova issue estrutural deve nascer de um problema observável e possuir owner, evidência e critério de conclusão. Não reabrir epics apenas para manter um backlog permanente.

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
- `docs/ROADMAP.md` — baseline estrutural e política para próximos ciclos;
- docs técnicos — contratos presentes;
- `docs/tasks/` — somente contratos/planos duráveis que continuem úteis após o merge;
- issues/PRs/commits/testes — histórico de execução.
