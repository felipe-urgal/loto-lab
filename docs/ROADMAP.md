# Roadmap técnico e de produto

> Baseline revisada em **2026-08-30**, após o merge do #137 (`257ebbcc`).
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
- primeiras consolidações de CSS legado (#134–#137);
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
- Protótipo 1 aplicado ao produto inteiro;
- copy PT-BR e piso funcional de 16px pertencendo à fonte canônica.

### Dívidas ativas reais

- `main` continua sem branch protection obrigatória (#52);
- consolidação visual final ainda não terminou (#121);
- `src/api/app.ts` e `LotoLabApiServices` ainda concentram parte do ownership HTTP/infra (#61);
- frontend segue majoritariamente JavaScript grande/imperativo; TypeScript e primitives compartilhadas ainda são backlog (#60);
- hotspots algorítmicos continuam grandes (#62);
- observabilidade segue baseada principalmente em logs/estado persistido, sem métricas/SLOs (#63);
- arquitetura de informação pós-redesign ainda pode reduzir troca de contexto (#64);
- otimizações operacionais restantes precisam de baseline antes/depois (#65);
- o fluxo hipótese → evidência → decisão ainda não é uma entidade explícita (#66).

---

# Now

## #52 — Governança de `main` · P0 · bloqueada

A API do GitHub foi revalidada em 2026-08-30: `main.protected = false` e não há required status checks.

**Próxima ação:** configuração administrativa no GitHub/`gh api` para exigir PR + `CI / test`, bloquear force-push/exclusão e então revalidar.

Esta tarefa não precisa de PR de código.

## #121 — Finalizar consolidação do Protótipo 1 · P0 · em andamento

O rollout visual principal está concluído. Restam:

- auditar folhas específicas de Painel, Análises, Gerador e Meus Jogos;
- remover apenas CSS comprovadamente redundante/sem consumidor;
- absorver hardening/refinement meramente corretivo quando houver ownership canônico claro;
- revisão transversal de WCAG, contraste, foco, teclado e reduced-motion;
- revisão de layout shift/performance visual;
- E2E desktop/mobile e revisão UX/UI final.

Refactors maiores de arquitetura frontend devem ir para #60; mudanças de jornada para #64.

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

## #60 — Frontend TypeScript, módulos e primitives · P1

A fundação visual já existe; o backlog restante é arquitetural:

- `web/src/{core,design-system,features,shared}` gradualmente;
- API client/errors/formatters/lifecycle/state compartilhados;
- TypeScript por feature;
- decomposição de módulos grandes;
- escaping/`textContent` como padrão seguro;
- primitives reutilizáveis sem framework obrigatório.

Começar depois da consolidação visual de #121 nas áreas que compartilham os mesmos arquivos.

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

O visual já foi unificado. O próximo passo é decidir, com protótipos e tarefas reais:

- Testes históricos contextualizados no Laboratório;
- Execuções contextualizadas nos trabalhos de origem;
- IA integrada às evidências quando reduzir troca de contexto;
- percepção coerente entre hash routes e páginas dedicadas.

Jornada alvo: `Entender → Experimentar → Aplicar → Acompanhar → Operar`.

## #65 — Runtime/Docker/performance baseada em evidência

O baseline de hardening já é forte. Restam decisões medidas:

- redes/egress;
- `stop_grace_period`;
- logs/retenção;
- limites CPU/memória;
- cache de análise;
- índices PostgreSQL só após profiling;
- concorrência de worker só após medir heap/tempo;
- resiliência CAIXA conforme falhas reais.

## #66 — Hipótese → experimento → evidência → decisão

Compor as peças já existentes — strategies, jobs, backtests, Lab, previews/seeds, real bets e AI insights — em uma cadeia explícita de proveniência e decisão reproduzível.

---

# Ordem recomendada

```text
#52 branch protection (administrativo, independente)

#121 consolidação visual final
  ↓
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

A ordem não impede trabalhos paralelos que não compartilhem risco/arquivos, mas evita refactors concorrentes sobre a mesma fronteira.

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

- desktop e mobile;
- teclado/foco;
- loading/empty/error/success;
- reduced-motion quando houver animação;
- browser E2E crítico.

Todos os PRs continuam exigindo **auto code review final no SHA verde** antes do squash merge.

---

# Auditoria da documentação · 2026-08-30

Todos os **26 arquivos Markdown** versionados foram revisados contra a `main` após #137. Arquivos corretos não receberam alteração cosmética apenas para trocar data; a tabela registra explicitamente a revisão completa.

| Documento | Resultado da auditoria |
| --- | --- |
| `README.md` | atualizado — estado, rollout, arquitetura e backlog |
| `docs/AGENDA.md` | atualizado — URL local e retirada de linguagem de milestone |
| `docs/AI.md` | atualizado — contexto/persistência atuais e URL local |
| `docs/ANALYSES.md` | validado sem alteração — contrato estatístico atual |
| `docs/API.md` | atualizado — application layer e famílias atuais |
| `docs/DATABASE.md` | atualizado — migrations/tabelas/repositories atuais |
| `docs/DATA_OPERATIONS.md` | validado sem alteração — bootstrap/sync atuais |
| `docs/DEPLOYMENT.md` | validado sem alteração — stack e segurança atuais |
| `docs/FINANCIALS.md` | validado sem alteração — pricing/rateio/ROI atuais |
| `docs/GENERATION.md` | validado sem alteração — score-v2 e geração atuais |
| `docs/LOTOFACIL_READINESS.md` | validado sem alteração — checklist atual |
| `docs/MENTAL_MODEL.md` | atualizado — application layer e superfícies atuais |
| `docs/METHODOLOGY.md` | atualizado — score-v2/Lab já implementados |
| `docs/MY_GAMES.md` | atualizado — linguagem ocultar/mostrar e lifecycle atual |
| `docs/OPERATIONS.md` | atualizado — reparo financeiro/agenda/notificações |
| `docs/PERFORMANCE.md` | atualizado — workspaces/cascata e workers atuais |
| `docs/PLATFORM.md` | validado sem alteração — Node 24.19.0 / TS 7.x |
| `docs/QUALITY.md` | validado sem alteração — CI/Security atuais |
| `docs/REAL_BETS.md` | atualizado — anti-hindsight e revisões financeiras |
| `docs/RELIABILITY.md` | validado sem alteração — hardening atual |
| `docs/ROADMAP.md` | atualizado — backlog real e dependências |
| `docs/STRATEGY_LAB.md` | atualizado — remove linguagem transitória de PR |
| `docs/WEB.md` | atualizado — sem readability/localization global e rollout completo |
| `docs/design/PROTOTYPE_1_DARK_MODERN.md` | atualizado — referência implementada e consolidação em #121 |
| `docs/tasks/MY_GAMES_V2.md` | atualizado — registro histórico/concluído |
| `docs/tasks/SENIOR_REVIEW_FINANCIAL_INTEGRITY.md` | atualizado — registro histórico e follow-up atual |

## Gestão futura

- README explica como usar/operar e aponta para documentos específicos;
- ROADMAP contém apenas prioridade/estado/dependência atuais;
- docs técnicos descrevem contratos presentes, não “milestones” antigos;
- `docs/tasks/` pode preservar decisões históricas, mas deve marcar explicitamente quando a tarefa estiver concluída;
- issues concluídas não permanecem abertas como documentação paralela;
- novos detalhes de execução entram nas issues/PRs, não como listas duplicadas no README.