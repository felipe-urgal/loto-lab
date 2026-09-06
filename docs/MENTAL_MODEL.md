# Loto Lab — mapa mental do projeto

O Loto Lab é um **laboratório reproduzível de hipóteses sobre composição de jogos**.

Ele não existe para “adivinhar dezenas”. O objetivo é transformar uma hipótese em regra explícita, executar por código, testar sem olhar o futuro e medir se o comportamento observado é melhor, pior ou indistinguível de baselines simples/acaso.

> **Algoritmo calcula; IA interpreta.**

## North Star

```text
Hipótese humana persistida
  ↓
Regra/estratégia versionada
  ↓
Experimento reproduzível
  ↓
Job auditável
  ↓
Evidência estatística/financeira canônica
  ↓
Validação fora da amostra
  ↓
Decisão humana auditável
  ↓
Eventual geração/aposta real
  ↓
Resultado real auditável
```

A #66 modela explicitamente essa cadeia. Hoje a raiz `research_hypotheses` já existe e pode associar um `backtest_run` persistido como primeiro tipo de evidência canônica. A decisão humana ainda não é exposta pela API; isso é intencional para não transformar simples presença de evidência em conclusão automática.

## Mapa funcional

### Dados

Fonte oficial: CAIXA.

Responsabilidades:

- bootstrap/sync de concursos;
- rateios e arrecadação;
- lacunas e censura do histórico;
- agenda/próximo concurso;
- reparos financeiros;
- PostgreSQL como fonte de verdade.

### Análises

Camadas:

1. **observado** — o que ocorreu no histórico;
2. **esperado** — baseline matemático quando existe modelo válido;
3. **validado** — diferença medida fora da amostra/sem leakage.

O score operacional usa histórico, ano, mês, últimos 10 e últimos 20 concursos contínuos. `strong`, `balanced` e `cold` são rótulos do modelo, não afirmações de probabilidade futura.

Análises 2.0 cobre Classificação, Estrutura, Dinâmica, Combinações e Validação. O hotspot `src/analysis/advanced.ts` está sendo decomposto de forma incremental; continuidade/qualidade já possui owner próprio em `src/analysis/continuity.ts`, preservando os contratos caracterizados.

### Geração

A geração transforma metodologia em jogos auditáveis.

| Loteria | Núcleo operacional |
| --- | ---: |
| Mega-Sena | 3 fixas |
| Lotofácil | 8 fixas por padrão |
| Dia de Sorte | 3 fixas |

Generator 2.0 separa planejamento, preview e save. Modo diversificado usa seed reproduzível.

### Conferência e Meus Jogos

Lotes gerados não equivalem a apostas reais. A conferência mede resultado oficial. Meus Jogos gerencia lifecycle, comparação e apostas reais sem apagar auditabilidade.

### Testes históricos

Regra central:

```text
Ao testar concurso N:

histórico entregue ao algoritmo = concursos < N
resultado de N = invisível durante geração/classificação
concursos > N = invisíveis
```

Só depois o resultado alvo é revelado.

### Strategy Lab

Compara hipóteses sob o mesmo recorte e recursos equivalentes. O benchmark usa controles aleatórios reproduzíveis, correção por múltiplas comparações e guardrails de resolução/amostra.

### Pesquisa e proveniência

`research_hypotheses` responde **qual hipótese humana está sendo investigada?**.

O primeiro vínculo de evidência usa `research_hypothesis_backtest_evidence` para apontar diretamente a um `backtest_run` canônico. Não existe `evidence_id` genérico nem cópia do resultado para um JSON paralelo.

Guardrails:

- hipótese decidida não recebe evidência nova;
- hipótese restrita a uma loteria só recebe backtest compatível;
- ausência/inconclusão de evidência não é preenchida artificialmente;
- decisão não é inferida pela IA nem pelo simples fato de existir um backtest;
- próxima vertical da #66 é a decisão humana/auditável sobre evidência já associada.

### Financeiro

Conceitos separados:

- custo;
- prêmio;
- resultado líquido;
- ROI;
- cobertura financeira;
- aposta real versus simulação histórica.

Prêmio zero conhecido é diferente de dado financeiro desconhecido.

### Operação

Scheduler/CLI/HTTP compartilham a rotina de sincronização operacional:

- atualizar histórico;
- reparar rateios recentes;
- reconciliar apostas reais;
- atualizar agenda/notificações;
- registrar `operation_runs`.

Observabilidade operacional cobre HTTP, Analysis Jobs, sync, pool PostgreSQL, CAIXA e OpenAI. São sinais para construir baseline; não SLOs finais automáticos.

Produção também possui `npm run prod:resources`, snapshot read-only de CPU/memória de `app` e `postgres` para comparação antes/depois de tuning.

### IA

A IA recebe snapshot de evidências já calculadas e persiste interpretação auditável. Ela pode explicar riscos/resultados e sugerir próximos experimentos; não fabrica métricas, escolhe dezenas nem decide hipótese.

## Arquitetura mental do código

```text
src/
├── application/      use cases e portas de aplicação
├── analysis/         score, ranking e análise avançada
├── api/              controllers HTTP e composition root
├── backtest/         simulação histórica
├── checker/          conferência
├── cli/              interfaces e lifecycle de processo
├── data/             CAIXA, bootstrap e transformação
├── domain/           tipos e invariantes compartilhados
├── finance/          preço histórico, prêmios e ROI
├── generator/        composição/planning
├── lab/              experimentos e inferência
├── lotteries/        configuração das loterias
├── notifications/    regras de notificações
├── observability/    métricas process-local e logs
├── operations/       sincronização operacional
├── persistence/      repositories PostgreSQL
├── realBets/         contratos de apostas reais
└── ai/               contexto, provider e contratos de IA

web/
├── *.html / boundaries JS finos
├── runtime.js
├── src/
│   ├── core/         API, feature loader, lifecycle, contexto principal
│   ├── features/     owners funcionais das superfícies
│   └── shared/       escaping, formatters, toast e helpers compartilhados
├── design-system.css / ui-foundation.css
└── *-workspace.css + CSS funcional quando necessário
```

## Direção arquitetural backend

```text
HTTP / CLI / Scheduler / Worker
          ↓
Application Use Cases
          ↓
Domain / engines
          ↓
Ports
          ↓
PostgreSQL / CAIXA / OpenAI / worker_threads
```

A #61 está concluída: controllers de feature HTTP não criam repositories/managers/providers concretos. `src/api/server.ts` é o composition root das features HTTP; `src/cli/apiStart.ts` continua dono de start/recovery/drain do `AnalysisJobManager`, scheduler e runtime lock.

A decomposição de motores/hotspots pertence à #62 e não deve reabrir a fronteira HTTP sem necessidade comprovada.

## Direção frontend

A linguagem visual oficial é o **Protótipo 1 — Dark Moderno** e o rollout visual está concluído pela #121.

A #60 agora é arquitetural. `web/src` já possui core compartilhado e owners TypeScript para as principais features; boundaries JavaScript migrados permanecem import-only. A evolução continua incremental, decompondo state/lifecycle e módulos grandes por responsabilidade real, sem rewrite de framework.

A #64 trata a jornada pós-redesign. O padrão adotado é contexto sem remoção de rotas: Análises, Laboratório, Execuções e Testes históricos se conectam por identidades canônicas/deep links, sem transportar payload opaco ou criar estado paralelo.

Detalhes: [`WEB.md`](WEB.md).

## Fronteiras que o projeto não deve cruzar

O Loto Lab não deve:

- afirmar que uma dezena está “para sair”;
- chamar dezena/jogo de garantido;
- converter atraso/frequência em probabilidade futura sem modelo válido;
- promover hipótese apenas porque venceu no mesmo período usado para escolhê-la;
- esconder resultados negativos;
- permitir leakage;
- misturar aposta real com backtest;
- usar IA para fabricar cálculo ou decidir hipótese;
- duplicar identidade/evidência quando existe owner canônico;
- alterar migration aplicada retroativamente;
- otimizar sem baseline comparável;
- enfraquecer teste/E2E para liberar PR.

## Como evoluir

Toda mudança deve tornar o sistema pelo menos um destes pontos melhor:

- mais auditável;
- mais testável;
- com ownership mais claro;
- menos acoplado;
- mais seguro contra concorrência/dados incorretos;
- mais simples para o usuário sem esconder metodologia.

Agentes de IA devem seguir [`../AGENTS.md`](../AGENTS.md). Roadmap: [`ROADMAP.md`](ROADMAP.md).
