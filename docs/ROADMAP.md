# Roadmap técnico e de produto

> Baseline reconciliada em **2026-09-06** sobre `main`, após os merges #234–#240.
>
> Este documento é a fonte de verdade para **prioridade, dependências e estado atual** das issues estruturais. Detalhes de implementação, decisões históricas e contratos de cada fatia pertencem às próprias issues/PRs e a `docs/tasks/`.

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

A diretriz permanece:

> **Algoritmo calcula; IA interpreta.**

## Estado consolidado

### Capacidades já consolidadas

- PostgreSQL é a fonte de verdade operacional, com migrations forward-only, checksum e advisory lock;
- composition root das features HTTP centralizado em `src/api/server.ts` (#61 concluída);
- core estatístico, anti-leakage, geração reproduzível, Strategy Lab e financeiro auditável protegidos por testes;
- frontend em migração TypeScript incremental, com owners canônicos em `web/src` e boundaries JavaScript migrados mantidos como import-only;
- Protótipo 1 consolidado e arquitetura de informação seguindo o Protótipo A contextual;
- observabilidade operacional cobre HTTP, Analysis Jobs, sync, pool PostgreSQL, requests à CAIXA e requests à OpenAI;
- a jornada científica possui raiz persistida em `research_hypotheses` e primeiro vínculo de evidência canônica para `backtest_runs`;
- produção possui operação read-only `prod:resources` para capturar baseline de CPU/memória antes de qualquer tuning;
- CI funcional, Security e E2E continuam como guardrails proporcionais ao risco.

### Entregas recentes #234–#240

- #234 / #60 — Agenda passou a reutilizar o contrato tipado compartilhado de identidade de loteria;
- #235 / #63 — métricas process-local da OpenAI com outcomes, latência e uso de tokens conhecido, sem conteúdo sensível;
- #236 / #62 — primeira extração efetiva de `analysis/advanced.ts`: continuidade/qualidade agora possui owner dedicado;
- #237 / #64 — Execuções pode retornar um backtest concluído por `jobId`, reconstruindo o resultado a partir das fontes persistidas;
- #238 / #66 — hipótese pode associar `backtest_run` como evidência canônica por FK explícita e invariantes de lifecycle/loteria;
- #239 / #64 — contrato de leitura detalhada de backtest por ID foi reconciliado para não fabricar a contagem de rounds;
- #240 / #65 — `prod:resources` adicionou snapshot bounded/read-only de CPU e memória para `app` e `postgres`.

### Dívidas ativas reais

- `main` continua sem branch protection obrigatória (#52);
- frontend ainda possui state/lifecycle imperativo e módulos grandes nas superfícies restantes (#60);
- `analysis/advanced.ts` continua hotspot, embora continuidade/qualidade já tenha sido extraída (#62);
- métricas operacionais existem, mas ainda falta baseline observada suficiente para transformar sinais em poucos SLOs e runbooks (#63);
- a jornada contextual ainda pode reduzir troca de contexto em Laboratório/proveniência/IA, desde que sem criar estado duplicado (#64);
- performance continua dependente de medições comparáveis antes/depois; `prod:resources` é ferramenta de baseline, não autorização para tuning (#65);
- hipótese + evidência de backtest existem, mas a API ainda não expõe a decisão humana/auditável (#66).

---

# Now

## #52 — Governança de `main` · P0 · bloqueada

Revalidado em **2026-09-06**: `main.protected = false` e não há required status checks aplicados pela proteção de branch.

**Próxima ação:** configuração administrativa no GitHub para exigir PR + `CI / test`, bloquear force-push/exclusão e então revalidar.

Esta tarefa não precisa de PR de código.

## #60 — Frontend TypeScript, módulos e primitives · P1 · em andamento

A fundação TypeScript e os principais owners funcionais já estão consolidados. Guardrails recentes incluem:

- #222 protege boundaries JavaScript migrados contra reintrodução de implementação/fallback paralelo;
- #227 centraliza identidade e normalização do contexto principal;
- #234 fez a Agenda consumir o mesmo contrato de identidade de loteria sem duplicar a union local.

**Próximas fatias:**

- reduzir state/lifecycle imperativo nas superfícies restantes;
- decompor módulos grandes por responsabilidade real;
- expandir `web/src/{core,features,shared}` somente quando houver contrato concreto;
- manter boundaries JS finos/import-only durante a migração;
- continuar usando escaping/`textContent`, cleanup explícito e lifecycle compartilhado.

Não reabrir redesign visual nem iniciar rewrite/framework sem evidência.

## #63 — Métricas e SLOs operacionais · P1 · em andamento

Entregue até aqui:

- #206 — baseline HTTP por famílias de rota, error rates e p50/p95/p99;
- #212 — snapshot persistido da saúde de Analysis Jobs;
- #217 — snapshot operacional de sync com estados/duração;
- #224 — métricas de pressão do pool PostgreSQL;
- #230 — requests/sucessos/erros/timeouts e latência da CAIXA;
- #235 — requests/sucessos/erros/timeouts, latência e uso de tokens conhecido da OpenAI.

Todos os sinais ficam atrás do endpoint operacional autenticado e nenhum é tratado como SLO final sem baseline observada.

**Próximas fatias:**

- observar baseline real de HTTP, jobs, sync, PostgreSQL, CAIXA e OpenAI;
- definir poucos SLOs úteis para HTTP, sync e jobs a partir dos dados observados;
- escrever runbooks curtos para falhas reais/observáveis;
- só então decidir timeout/retry/backoff ou tuning relacionado aos providers.

Não introduzir tracing distribuído ou tuning de pool/timeouts sem necessidade medida.

---

# Next

## #62 — Motores e hotspots algorítmicos · P2 · em andamento

A dependência arquitetural da #61 está concluída. Também já existem:

- #207 — espaço/baselines do planejamento extraídos;
- #208 — reporting/séries do Strategy Lab extraídos;
- #213 — constraints estruturais do gerador extraídas;
- #223 — plano explícito de decomposição de `analysis/advanced.ts`;
- #228 — characterization de continuidade/qualidade, incluindo gaps e left-censoring;
- #236 — continuidade/qualidade extraída para `src/analysis/continuity.ts` com equivalência preservada.

**Próxima fatia de código:** seguir a ordem do plano com **estatística/combinatória compartilhada**, em PR independente e sem mudança metodológica.

Depois, quando houver seam coesa: estrutura → associações → dinâmica/ciclos → validação rolling → similaridade/composição final.

Qualquer mudança metodológica deve ser separada do refactor e possuir issue/PR próprios.

## #64 — Arquitetura de informação e jornada pós-redesign · P2 · em andamento

Direção adotada: **Protótipo A — contexto sem remoção de rotas**.

Entregue:

- #210 — decisão e mapa da jornada `Entender → Experimentar → Aplicar → Acompanhar → Operar`;
- #220 — Laboratório → Testes históricos;
- #225 — Análises → Laboratório/Gerador;
- #229 — Execuções → owners funcionais de origem;
- #237 — retorno de backtest concluído por `jobId`, reconstruído a partir de `analysis_jobs` + `backtest_runs`;
- #239 — reconciliação do shape detalhado do backtest por ID sem fabricar `roundCount`.

Esses links reutilizam rotas/owners existentes e não carregam payload de resultado, prefill opaco ou recomendação automática.

**Próximas fatias:**

- avaliar retorno contextual do Laboratório somente quando houver identidade persistida suficiente;
- integrar proveniência experimento/evidência com #66 quando isso reduzir troca de contexto;
- integrar IA a evidências/resultados apenas sem esconder metodologia nem criar estado paralelo;
- revisar agrupamento global da navegação apenas com evidência de uso.

## #66 — Hipótese → experimento → evidência → decisão · P2 · em andamento

O desenho mínimo foi fechado em #226, a raiz persistida entrou em #231 e a primeira evidência canônica em #238.

Estado atual:

- `research_hypotheses` fornece ID estável, título, descrição, loteria opcional, lifecycle e campos de decisão protegidos por constraints;
- API autenticada permite criar/listar/ler hipóteses abertas;
- `research_hypothesis_backtest_evidence` associa diretamente `backtest_runs`, sem `evidence_id` genérico nem cópia de payload;
- use case e PostgreSQL validam lifecycle e compatibilidade de loteria, inclusive contra associação concorrente após decisão;
- a API **ainda não permite decidir** uma hipótese.

**Próxima fatia:** definir e implementar o contrato de decisão humana/auditável usando evidência já associada e justificativa explícita.

A decisão deve distinguir ausência de evidência, evidência inconclusiva/desfavorável, continuação de teste e aplicação experimental. A IA continua apenas interpretando evidências calculadas; não decide probabilidade futura.

## #65 — Runtime/Docker/performance baseada em evidência · P2 · em andamento

Guardrails já entregues incluem retenção bounded de logs, grace period coerente com shutdown, separação de rede interna/egress e profiling PostgreSQL.

#240 adicionou:

```bash
npm run prod:resources
```

O comando captura um snapshot estruturado e somente leitura de CPU/memória de `app` e `postgres`. Uma amostra isolada não define limite, capacidade nem SLO.

Próximas decisões continuam exigindo baseline antes/depois:

- coletar `prod:resources` sob cargas comparáveis antes de considerar limites de CPU/memória;
- Web Vitals/LCP/INP/CLS em ambiente representativo;
- cache/revisão da análise avançada apenas com gargalo medido;
- índices PostgreSQL somente após profiling;
- concorrência de workers após medir heap/tempo;
- ajustes de resiliência CAIXA/OpenAI a partir das baselines da #63.

---

# Concluído estrutural

## #61 — Application use cases e controllers finos · concluída

Controllers de feature HTTP não compõem repositories/managers/providers concretos. `src/api/server.ts` é o composition root HTTP e `src/cli/apiStart.ts` permanece owner do lifecycle de processo/scheduler/recovery/drain.

A conclusão da #61 não inclui decomposição matemática da #62 e não deve ser reaberta apenas por estética arquitetural.

---

# Ordem recomendada

```text
#52 branch protection (administrativo, independente)

#60 frontend TS/primitives
  ↓
#64 jornada/contexto

#63 observar baseline → SLOs/runbooks
  ↓
#65 tuning somente quando a medição justificar

#62 advanced.ts: estatística/combinatória

#66 decisão humana sobre hipótese/evidência
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

Validações adicionais seguem o risco da mudança conforme `AGENTS.md` e a documentação especializada. Todo PR próprio exige auto code review final no SHA verde antes do squash merge.

## Gestão documental

- `AGENTS.md` define invariantes e fluxo operacional estável;
- `docs/ROADMAP.md` mantém apenas prioridade, estado e dependências atuais;
- docs técnicos descrevem contratos presentes;
- `docs/tasks/` preserva planos, decisões e registros de fatias específicas;
- issue da epic mantém o backlog vivo e critérios de aceite;
- PR registra a mudança concreta e sua validação.

O índice de `docs/tasks/` está em [`docs/tasks/README.md`](tasks/README.md).
