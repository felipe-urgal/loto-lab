# Loto Lab — mapa mental do projeto

O Loto Lab é um **laboratório reproduzível de hipóteses sobre composição de jogos**.

Ele não existe para “adivinhar dezenas”. O objetivo é transformar uma hipótese em regra explícita, executar por código, testar sem olhar o futuro e medir se o comportamento observado é melhor, pior ou indistinguível de baselines simples/acaso.

> **Algoritmo calcula; IA interpreta.**

## North Star

```text
Hipótese
  ↓
Regra/estratégia versionada
  ↓
Experimento reproduzível
  ↓
Evidência estatística/financeira
  ↓
Validação fora da amostra
  ↓
Decisão
  ↓
Eventual geração/aposta real
  ↓
Resultado real auditável
```

A #66 rastreia a modelagem explícita dessa cadeia de proveniência. Hoje várias peças já existem, mas ainda não formam uma entidade única de “pesquisa”.

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

O score operacional atual usa cinco janelas:

- histórico;
- ano;
- mês;
- últimos 10;
- últimos 20 concursos contínuos.

`strong`, `balanced` e `cold` são rótulos do modelo, não afirmações de probabilidade futura.

Análises 2.0 cobre Classificação, Estrutura, Dinâmica, Combinações e Validação.

### Geração

A geração transforma metodologia em jogos auditáveis.

Padrões atuais:

| Loteria | Núcleo operacional |
| --- | ---: |
| Mega-Sena | 3 fixas |
| Lotofácil | 8 fixas por padrão |
| Dia de Sorte | 3 fixas |

Generator 2.0 separa planejamento, preview e save. Modo diversificado usa seed reproduzível.

### Conferência e Meus Jogos

Lotes gerados não equivalem a apostas reais.

A conferência mede resultado oficial. Meus Jogos gerencia lifecycle, comparação e apostas reais sem apagar auditabilidade.

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

Compara hipóteses sob o mesmo recorte e recursos equivalentes.

Famílias atuais incluem:

- tamanho do núcleo;
- modelos de score;
- regras externas da Mega-Sena.

O benchmark usa controles aleatórios reproduzíveis, correção por múltiplas comparações e guardrails de resolução/amostra.

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

### IA

A IA recebe snapshot de evidências já calculadas e persiste interpretação auditável.

Ela pode explicar riscos/resultados e sugerir próximos experimentos; não pode fabricar métricas ou jogos.

## Arquitetura mental do código

```text
src/
├── application/      use cases e portas de aplicação
├── analysis/         score, ranking e análise avançada
├── api/              controllers HTTP, composição e adapters de worker HTTP
├── backtest/         simulação histórica
├── checker/          conferência
├── cli/              interfaces de linha de comando
├── data/             CAIXA, bootstrap e transformação
├── domain/           tipos e invariantes compartilhados
├── finance/          preço histórico, prêmios e ROI
├── generator/        composição/planning
├── lab/              experimentos e inferência
├── lotteries/        configuração das loterias
├── notifications/    regras de notificações
├── operations/       sincronização operacional
├── persistence/      repositories PostgreSQL
└── ai/               contexto, provider e contratos de IA

web/
├── shell + feature-loader
├── design-system.css / ui-foundation.css
├── Painel
├── Análises
├── Gerador
├── Meus Jogos
├── Testes históricos
├── Laboratório
├── Estratégias
├── Execuções
├── Agenda
└── IA
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

A migração está avançada, mas não concluída. `src/api/app.ts` e `LotoLabApiServices` ainda mantêm parte do ownership legado (#61).

## Direção frontend

A linguagem oficial é o **Protótipo 1 — Dark Moderno**.

O rollout visual principal está concluído; #121 acompanha a consolidação final. #60 acompanha TypeScript, primitives e modularização. #64 acompanha arquitetura de informação pós-redesign.

## Fronteiras que o projeto não deve cruzar

O Loto Lab não deve:

- afirmar que uma dezena está “para sair”;
- chamar dezena/jogo de garantido;
- converter atraso/frequência em probabilidade futura sem modelo válido;
- promover hipótese apenas porque venceu no mesmo período usado para escolhê-la;
- esconder resultados negativos;
- permitir leakage;
- misturar aposta real com backtest;
- usar IA para fabricar cálculo;
- alterar migration aplicada retroativamente;
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