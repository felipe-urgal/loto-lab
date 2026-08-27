# Roadmap técnico e de produto

> Baseline da auditoria sênior: 2026-08-27.
>
> Este documento é a fonte de verdade para a evolução estrutural do Loto Lab. Ele substitui listas históricas de “próximos milestones” no README.

## Objetivo

Evoluir o Loto Lab de uma base funcional e robusta para uma plataforma de pesquisa reproduzível, auditável e sustentável, preservando o que já está correto e reduzindo a complexidade acumulada nas bordas do sistema.

A diretriz central permanece:

> **Algoritmo calcula; IA interpreta.**

O roadmap não busca um rewrite. A estratégia é **consolidação incremental por PRs pequenos, testáveis e reversíveis**.

## North Star

O produto deve permitir rastrear um fluxo completo:

```text
Hipótese
  ↓
Estratégia/configuração versionada
  ↓
Experimento reproduzível
  ↓
Job auditável
  ↓
Resultado estatístico/financeiro
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

Cada transição relevante deve possuir, quando aplicável:

- identificador estável;
- versão da metodologia/configuração;
- inputs e outputs;
- timestamps;
- proveniência;
- estado explícito;
- evidência suficiente para reprodução.

## Princípios de implementação

1. **Sem rewrite geral.** Refactors devem preservar comportamento e usar os testes como rede de segurança.
2. **PRs verticais e pequenos.** Evitar mudanças horizontais que alterem muitas camadas ao mesmo tempo.
3. **Domínio antes da interface.** HTTP, CLI e UI orquestram; cálculo e regra pertencem ao core/application.
4. **Integridade em profundidade.** Regras críticas continuam protegidas em TypeScript e PostgreSQL quando isso reduz risco real.
5. **Medição antes de performance.** Índices, concorrência e otimizações precisam de baseline antes/depois.
6. **Complexidade analítica ≠ complexidade cognitiva.** A UI pode oferecer profundidade por progressive disclosure.
7. **IA não é motor probabilístico.** A camada de IA interpreta evidências calculadas e não escolhe dezenas.
8. **CI é contrato de merge.** Nenhuma mudança é considerada pronta com CI vermelho ou revisão incompleta.

## Estado atual resumido

### Pontos fortes a preservar

- core estatístico e anti-leakage;
- PostgreSQL como fonte de verdade operacional;
- migrations versionadas com advisory lock e checksum;
- constraints/triggers de integridade de domínio;
- worker threads e gates para trabalhos CPU-bound;
- runtime single-instance explícito por banco;
- graceful startup/shutdown e recovery;
- container não-root/read-only com capabilities reduzidas;
- CI com PostgreSQL, cobertura, audit, Docker smoke, autenticação e browser E2E;
- IA restrita a interpretação auditável.

### Dívidas prioritárias

- `main` ainda sem proteção obrigatória;
- cobertura desigual nas bordas HTTP/orquestração;
- testes PostgreSQL serializados por compartilharem estado;
- falta de contract tests TS ↔ PostgreSQL e upgrade tests de migrations;
- frontend depende de camadas corretivas de tipografia/localização em runtime;
- frontend cresceu por `*-v2`, `*-hardening`, `*-refinements` e módulos grandes;
- concentração de responsabilidades em `LotoLabApiServices`, handlers e hotspots algorítmicos;
- observabilidade baseada principalmente em logs, sem métricas operacionais suficientes;
- README/documentação histórica começou a divergir do produto entregue.

---

# Now — P0/P1

## 0. Governança de `main`

**Issue:** #52

Configurar branch protection/ruleset para:

- exigir Pull Request;
- exigir `CI / test` verde;
- bloquear force-push;
- bloquear exclusão de `main`;
- exigir branch atualizada quando aplicável;
- aplicar regras a administradores quando a operação permitir;
- manter squash merge como fluxo preferencial.

**Definition of Done:** `main.protected = true` e o check obrigatório aparece na configuração do repositório.

## 1. Rede de segurança das bordas críticas

### 1.1 Analysis Jobs API

**Issue:** #54

Cobrir criação, consulta, listagem, cancelamento, validações, estados terminais e failure paths da camada HTTP de jobs.

### 1.2 AI e Operations

**Issue:** #55

Cobrir contexto/evidence hash/dedupe/force/provider failures e fluxos operacionais `partial`/`failed`.

**Objetivo da fase:** antes de alterar arquitetura, estabelecer characterization tests das bordas que podem quebrar estado, custo externo ou experiência operacional.

## 2. Isolamento e contratos de dados

### 2.1 PostgreSQL por worker/suíte

**Issue:** #56

Remover a dependência estrutural de `--test-concurrency=1` através de isolamento real de banco/schema.

### 2.2 Contratos TS ↔ PostgreSQL e migrations

**Issue:** #57

Adicionar:

- fixtures compartilhadas de invariantes;
- contract tests aplicação/banco;
- testes de upgrade N-1 → N;
- verificação de preservação de dados.

## 3. CI e supply chain

**Issue:** #58

Adicionar de forma deliberada:

- permissions mínimos;
- concurrency/timeout;
- SAST/CodeQL;
- dependency review quando suportado;
- scan da imagem;
- SBOM;
- política clara de severidade/falsos positivos.

A proteção da #52 torna esses checks realmente vinculantes.

## 4. Frontend: fonte de verdade antes de nova arquitetura

### 4.1 Remover correções em runtime

**Issue:** #59

Estado alvo:

```text
fonte correta → browser
```

Não:

```text
fonte incorreta → CSS corretivo → MutationObserver → classe corretiva
```

Entregas:

- tipografia correta nos stylesheets canônicos;
- PT-BR correto nos templates/módulos de origem;
- remoção gradual de `readability.css`, `readability.js` e `localization.js`;
- redução de `!important` corretivo;
- preservação do piso funcional de 16 px, foco, teclado e reduced motion.

### 4.2 Design System + TypeScript + módulos

**Issue:** #60

Arquitetura alvo:

```text
web/src/
├── core/
│   ├── api.ts
│   ├── router.ts
│   ├── state.ts
│   ├── lifecycle.ts
│   ├── dom.ts
│   └── format.ts
├── design-system/
│   ├── tokens.css
│   ├── components.css
│   └── primitives.ts
├── features/
│   ├── dashboard/
│   ├── analysis/
│   ├── generation/
│   ├── games/
│   ├── lab/
│   ├── strategies/
│   ├── jobs/
│   ├── agenda/
│   └── ai/
└── app.ts
```

Não há decisão de adotar React/Vue/Svelte. A primeira meta é um frontend vanilla moderno, tipado e modular.

## 5. Backend application architecture

**Issue:** #61

Arquitetura alvo:

```text
Interfaces
HTTP · CLI · Scheduler · Worker
        ↓
Application
Analyze · Generate · Backtest · Sync · Bet · Lab · AI · Jobs
        ↓
Domain
Lottery · Analysis · Generation · Finance · Strategy · Experiment
        ↓
Ports
Repositories · CAIXA · AI · Worker executor
        ↓
Infrastructure
PostgreSQL · OpenAI · CAIXA · worker_threads
```

Prioridades:

- composition root explícito;
- handlers HTTP finos;
- use cases testáveis sem servidor;
- redução progressiva de responsabilidades de `LotoLabApiServices`;
- nenhuma mudança de contrato público não intencional.

## 6. Observabilidade

**Issue:** #63

Adicionar métricas antes de tracing distribuído:

- latência HTTP;
- taxa de erro;
- jobs por estado e idade do mais antigo;
- duração/status de sync;
- latência/erro CAIXA;
- latência/erro/uso OpenAI;
- saúde do pool PostgreSQL;
- poucos SLOs e runbooks úteis.

---

# Next — P2

## 7. Consolidar motores e hotspots algorítmicos

**Issue:** #62

Entregas graduais:

- registry/engine por loteria onde houver contrato comum real;
- decompor `analysis/advanced.ts` por conceito;
- decompor `generator/planning.ts`;
- separar Strategy Lab em experimento, inferência/benchmark e reporting;
- absorver arquivos transitórios `*-hardening` no módulo canônico;
- preservar diferenças legítimas entre Mega-Sena, Lotofácil e Dia de Sorte.

## 8. Arquitetura de informação e UX

**Issue:** #64

Jornada alvo:

```text
ENTENDER
Análises

EXPERIMENTAR
Laboratório

APLICAR
Gerar jogos

ACOMPANHAR
Meus jogos

OPERAR
Agenda · Execuções · Dados
```

Investigar antes de implementar:

- Backtests dentro do contexto do Laboratório;
- Execuções como detalhe contextual;
- IA integrada ao resultado/evidência quando isso reduzir troca de contexto;
- navegação única/coerente em vez de dois modelos de rota percebidos pelo usuário.

Princípio de Análises:

1. o que foi observado;
2. qual é o esperado/baseline;
3. existe evidência de diferença;
4. a amostra/resolução é suficiente;
5. detalhes e metodologia sob demanda.

## 9. Runtime, Docker e performance

**Issue:** #65

Somente com evidência:

- rede de dados interna separada de egress;
- `stop_grace_period` alinhado ao shutdown;
- limites CPU/memória;
- política de logs;
- imagem identificada pelo SHA/release;
- revisão leve de cache antes de carregar histórico completo;
- profiling PostgreSQL antes de índices;
- medição de worker heap/tempo antes de elevar concorrência;
- timeout/backoff/jitter para integrações quando necessário.

## 10. Fluxo científico de ponta a ponta

**Issue:** #66

Modelar explicitamente:

- hipótese;
- estratégia/configuração versionada;
- experimento;
- evidência;
- conclusão/decisão;
- proveniência até geração/aposta real quando aplicável.

A UI deve deixar explícito que hipótese e evidência histórica não equivalem a previsão futura.

---

# Later

Itens deliberadamente não prioritários até existir requisito ou evidência:

- escala horizontal multi-instância;
- ownership/lease/heartbeat distribuído de jobs;
- autenticação multi-user/RBAC;
- tracing distribuído completo;
- troca de framework frontend;
- circuit breaker complexo;
- aumento agressivo da concorrência de análises;
- índices PostgreSQL sem `EXPLAIN (ANALYZE, BUFFERS)` mostrando ganho.

## Critérios de pronto para qualquer refactor

Um refactor está pronto apenas quando:

```text
comportamento antes = comportamento depois
```

salvo mudança funcional explicitamente documentada.

### Backend

- typecheck;
- lint/static gates;
- testes;
- cobertura relevante;
- PostgreSQL integration;
- Docker smoke;
- E2E quando a superfície pública for afetada.

### Frontend

Validar no mínimo:

- desktop;
- mobile;
- teclado;
- foco;
- loading;
- empty;
- error;
- success;
- reduced motion quando houver animação;
- E2E crítico.

### Arquitetura

O PR precisa responder positivamente a pelo menos uma pergunta concreta:

- reduziu acoplamento?
- removeu duplicação?
- melhorou testabilidade?
- tornou ownership/responsabilidade mais claro?
- eliminou estado implícito?
- reduziu risco operacional?

Mover arquivos sem melhorar uma dessas propriedades não é considerado ganho arquitetural.

## Ordem recomendada

```text
#52 governança
  ↓
#54 Analysis Jobs API
  ↓
#55 AI / Operations tests
  ↓
#56 isolamento PostgreSQL
  ↓
#57 contracts / migration upgrades
  ↓
#58 CI / supply chain
  ↓
#59 frontend source-of-truth
  ↓
#60 design system / TS / modularização
  ↓
#61 application architecture
  ↓
#63 observabilidade
  ↓
#62 engines / hotspots
  ↓
#64 UX / IA
  ↓
#65 runtime / performance
  ↓
#66 fluxo científico
```

Alguns trabalhos podem ocorrer em paralelo quando não compartilham risco, mas a ordem acima indica as principais dependências técnicas.

## Gestão do roadmap

- Issues representam epics/entregas rastreáveis.
- Cada epic grande deve ser dividido em PRs menores conforme a implementação se aproxima.
- Novas tarefas devem entrar neste roadmap apenas quando alterarem prioridade, dependência ou arquitetura; detalhes de execução pertencem às issues/PRs.
- Itens concluídos saem de `Now/Next` e podem ser registrados no histórico de releases/PRs em vez de permanecerem como backlog obsoleto.
