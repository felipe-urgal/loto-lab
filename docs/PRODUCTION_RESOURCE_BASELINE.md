# Baseline de recursos em produção

Este documento define como coletar evidência comparável de CPU e memória antes de qualquer decisão de tuning no Loto Lab.

A ferramenta canônica permanece:

```bash
npm run prod:resources
```

Ela produz um snapshot read-only de `app` e `postgres` usando Docker Compose. O objetivo deste protocolo é evitar conclusões baseadas em uma única amostra ou em cargas diferentes.

## Princípio

Uma medição só é útil para comparação quando o contexto observado é conhecido.

Não use um snapshot isolado para decidir:

- limites de CPU/memória;
- aumento de concorrência de workers;
- tamanho do pool PostgreSQL;
- timeout/retry;
- criação de índice;
- regressão/melhoria de performance.

## Registro mínimo por série

Antes da primeira coleta, registre:

- data/hora e timezone;
- release/SHA ou `LOTO_LAB_IMAGE_TAG`;
- estado da stack (`npm run prod:status`);
- tipo de workload;
- loteria/feature envolvida quando isso for relevante para reproduzir a carga, sem registrar payload sensível;
- duração aproximada do workload;
- quantidade de operações concorrentes conhecida;
- qualquer condição externa relevante (sync da CAIXA, backtest, análise pesada, idle etc.).

## Workloads comparáveis

Prefira cenários explícitos, por exemplo:

- `idle`: aplicação saudável sem job/sync pesado conhecido;
- `sync`: uma sincronização operacional ativa;
- `backtest`: um backtest com parâmetros registrados e reproduzíveis;
- `analysis`: uma análise pesada conhecida;
- `mixed`: somente quando a simultaneidade fizer parte do cenário que se deseja medir.

Não compare `idle` antes com `backtest` depois e chame a diferença de ganho/regressão.

## Coleta

Para cada cenário:

1. confirme `prod:status` saudável;
2. registre release e workload;
3. faça múltiplas observações de `npm run prod:resources` durante a mesma classe de carga;
4. preserve cada saída bruta; não substitua valores por média manual sem manter as amostras;
5. marque observações afetadas por restart, deploy, falha externa ou mudança de workload;
6. repita o mesmo procedimento depois da mudança candidata.

O intervalo entre observações deve ser suficiente para não tratar várias leituras do mesmo instante como evidência independente. O protocolo não fixa um número mágico de segundos ou amostras porque cargas diferentes possuem durações diferentes; o importante é registrar a série e justificar a janela usada.

## Comparação antes/depois

Compare apenas séries que tenham:

- mesma classe de workload;
- parâmetros materialmente equivalentes;
- mesma topologia de produção;
- versão/base identificada;
- ausência de incidente externo que distorça a janela.

Analise separadamente:

- CPU de `app`;
- memória de `app`;
- CPU de `postgres`;
- memória de `postgres`.

Se houver variação alta dentro da própria série, trate o resultado como inconclusivo até coletar mais evidência.

## O que registrar na decisão

Uma decisão de tuning deve registrar:

- hipótese de gargalo;
- baseline anterior;
- mudança aplicada;
- baseline posterior comparável;
- ganho/regressão observado;
- trade-offs;
- margem operacional escolhida;
- plano de rollback;
- motivo para aceitar ou rejeitar a mudança.

Sem esse registro, a observação continua sendo diagnóstico, não justificativa de tuning.

## Casos específicos

### Concorrência de workers

Antes de elevar concorrência, registre heap/memória e duração sob a concorrência atual e sob workload reproduzível. Fila longa sozinha não prova que mais workers são seguros.

### PostgreSQL

Uso alto de CPU/memória não autoriza índice. Índice exige plano real/profiling que demonstre o gargalo e ganho esperado.

### Frontend

`prod:resources` mede containers, não Web Vitals. LCP/INP/CLS exigem medição própria em ambiente representativo.

### Providers externos

Latência de CAIXA/OpenAI não deve ser inferida por CPU/memória do container; use as métricas específicas do boundary.

## Critério de evidência insuficiente

Considere a comparação inconclusiva quando:

- workload não puder ser reproduzido;
- release não estiver identificada;
- houver poucas observações para distinguir pico de comportamento recorrente;
- ocorrer deploy/restart/incidente durante a janela;
- parâmetros antes/depois diferirem materialmente;
- a própria série apresentar variação maior que a diferença que se deseja atribuir à mudança.

Nesses casos, colete novamente em condições controladas em vez de ajustar limites por intuição.