# Roadmap técnico e de produto

> Baseline reconciliada em **2026-09-05** sobre `main`, após os merges #222–#231.
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

### Capacidades já consolidadas

- PostgreSQL é a fonte de verdade operacional, com migrations forward-only, checksum e advisory lock;
- composition root das features HTTP centralizado em `src/api/server.ts` (#61 concluída);
- core estatístico, anti-leakage, geração reproduzível, Strategy Lab e financeiro auditável protegidos por testes;
- frontend em migração TypeScript incremental, sem rewrite e com owners canônicos por feature;
- Protótipo 1 consolidado e arquitetura de informação seguindo o Protótipo A contextual;
- observabilidade operacional já cobre HTTP, Analysis Jobs, sync, pool PostgreSQL e requests à CAIXA;
- primeira raiz persistida da jornada científica criada em `research_hypotheses`;
- CI funcional, Security e E2E continuam como guardrails proporcionais ao risco.

### Entregas recentes #222–#231

- #222 / #60 — guard arquitetural para boundaries JavaScript já migrados: import-only, sem fallback funcional paralelo;
- #223 / #62 — plano de decomposição segura de `analysis/advanced.ts`, com ordem e critérios de aborto;
- #224 / #63 — métricas de pressão do pool PostgreSQL no endpoint operacional autenticado;
- #225 / #64 — próximos passos contextuais em Análises para Laboratório e Gerador, sem estado cruzado;
- #226 / #66 — contrato mínimo de proveniência e decisão, reaproveitando IDs canônicos existentes;
- #227 / #60 — contrato compartilhado para identidade/normalização de contexto principal da UI;
- #228 / #62 — characterization tests de continuidade/qualidade antes da primeira extração de `advanced.ts`;
- #229 / #64 — Execuções aponta de volta para os owners funcionais que originam os trabalhos, sem novo controller/estado;
- #230 / #63 — métricas process-local de requests à CAIXA, com cardinalidade fixa e latência bounded;
- #231 / #66 — migration `013_research_hypotheses.sql`, repository/use case e API autenticada para criar/listar/ler hipóteses abertas.

### Dívidas ativas reais

- `main` continua sem branch protection obrigatória (#52);
- frontend ainda possui state/lifecycle imperativo e módulos grandes em superfícies legadas/restantes (#60);
- `analysis/advanced.ts` ainda é hotspot; agora existe plano + characterization para decompor sem mudar metodologia (#62);
- observabilidade ainda não cobre OpenAI e ainda não há baseline observada suficiente para fixar SLOs/runbooks finais (#63);
- jornada contextual ainda precisa de retorno operacional por `jobId` e proveniência útil entre superfícies (#64);
- otimizações operacionais/performance continuam dependentes de medição antes/depois (#65);
- hipótese persistida existe, mas ainda falta ligar evidência canônica antes de permitir decisão auditável (#66).

---

# Now

## #52 — Governança de `main` · P0 · bloqueada

Revalidado em **2026-09-05**: `main.protected = false` e não há required status checks aplicados pela proteção de branch.

**Próxima ação:** configuração administrativa no GitHub para exigir PR + `CI / test`, bloquear force-push/exclusão e então revalidar.

Esta tarefa não precisa de PR de código.

## #60 — Frontend TypeScript, módulos e primitives · P1 · em andamento

A fundação TypeScript e os principais owners funcionais já estão consolidados. As fatias mais recentes adicionaram dois guardrails importantes:

- #222 protege boundaries JavaScript migrados contra reintrodução de implementação/fallback paralelo;
- #227 centraliza identidade e normalização do contexto principal, mantendo shell/lifecycle no mesmo contrato tipado.

**Próximas fatias:**

- reduzir state/lifecycle imperativo nas superfícies restantes;
- decompor módulos grandes por responsabilidade real;
- mover ownership para `web/src/{core,features,shared}` somente quando houver contrato concreto;
- manter boundaries JS finos durante a migração;
- continuar usando escaping/`textContent`, cleanup explícito e lifecycle compartilhado.

Não reabrir redesign visual nem iniciar rewrite/framework sem evidência.

## #63 — Métricas e SLOs operacionais · P1 · em andamento

Entregue até aqui:

- #206 — baseline HTTP por famílias de rota, error rates e p50/p95/p99;
- #212 — snapshot persistido da saúde de Analysis Jobs;
- #217 — snapshot operacional de sync com estados/duração;
- #224 — métricas de pressão do pool PostgreSQL;
- #230 — requests/sucessos/erros/timeouts e latência da CAIXA, sem labels de alta cardinalidade.

Todos os sinais ficam atrás do endpoint operacional autenticado e nenhum é tratado como SLO final sem baseline observada.

**Próximas fatias:**

- instrumentar OpenAI sem prompt, conteúdo ou credencial em métricas/logs;
- observar baseline real dos sinais existentes;
- definir poucos SLOs úteis para HTTP, sync, jobs e dependências;
- escrever runbooks baseados em falhas reais/observáveis.

Não introduzir tracing distribuído ou tuning de pool/timeouts sem necessidade medida.

---

# Next

## #62 — Motores e hotspots algorítmicos · P2 · em andamento

A dependência arquitetural da #61 está concluída. Também já existem:

- #207 — espaço/baselines do planejamento extraídos;
- #208 — reporting/séries do Strategy Lab extraídos;
- #213 — constraints estruturais do gerador extraídas;
- #223 — plano explícito de decomposição de `analysis/advanced.ts`;
- #228 — characterization de continuidade/qualidade, incluindo gaps e left-censoring.

**Próxima fatia de código:** extrair primeiro o owner de **continuidade/qualidade de dados**, preservando exatamente os contratos caracterizados em #228.

Depois, seguir a ordem planejada: estatística/combinatória compartilhada → estrutura → associações → dinâmica/ciclos → validação rolling → similaridade/composição final.

Qualquer mudança metodológica deve ser separada do refactor e possuir issue/PR próprios.

## #64 — Arquitetura de informação e jornada pós-redesign · P2 · em andamento

Direção adotada: **Protótipo A — contexto sem remoção de rotas**.

Entregue:

- #210 — decisão e mapa da jornada `Entender → Experimentar → Aplicar → Acompanhar → Operar`;
- #220 — Laboratório → Testes históricos;
- #225 — Análises → Laboratório/Gerador;
- #229 — Execuções → owners funcionais de origem.

Esses links reutilizam rotas/owners existentes e não carregam estado implícito, prefill ou recomendação automática.

**Próximas fatias:**

- `jobId` como retorno operacional com contrato único e deep link seguro;
- proveniência útil entre experimento/evidência quando o dado já existir;
- integração contextual da IA somente após existir evidência canônica suficiente;
- revisar agrupamento global da navegação apenas com evidência de uso.

## #66 — Hipótese → experimento → evidência → decisão · P2 · em andamento

O desenho mínimo foi fechado em #226 e a primeira vertical persistida entrou em #231.

Estado atual:

- `research_hypotheses` fornece ID estável, título, descrição, loteria opcional, lifecycle e campos de decisão protegidos por constraints;
- API autenticada permite criar/listar/ler hipóteses abertas;
- nenhuma identidade paralela foi criada para backtest, job, preview, batch, aposta ou AI insight;
- a API **não permite decidir** uma hipótese ainda, porque decisão sem evidência associada produziria proveniência incompleta.

**Próxima fatia:** associar **um único tipo de evidência persistida existente** à hipótese com FK explícita e validação de compatibilidade. Somente depois disso expor mutação de decisão humana/auditável.

A IA continua apenas interpretando evidências calculadas; não cria cálculo crítico nem decide probabilidade futura.

---

# Later / P2

## #65 — Runtime/Docker/performance baseada em evidência

Guardrails já entregues incluem retenção bounded de logs, grace period coerente com shutdown e separação de rede interna/egress.

Restam decisões que exigem baseline antes/depois:

- Web Vitals/LCP/INP/CLS em ambiente representativo;
- limites CPU/memória;
- cache de análise;
- índices PostgreSQL após profiling;
- concorrência de workers após medir heap/tempo;
- ajustes de resiliência CAIXA a partir dos sinais agora disponíveis na #63.

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

#63 observabilidade → baseline → SLO/runbooks

#62 advanced.ts: continuidade/qualidade primeiro
  ↓
#66 hipótese + evidência + decisão

#65 avança somente quando houver medição suficiente
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
