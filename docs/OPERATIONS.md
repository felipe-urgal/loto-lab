# Operação automática do Loto Lab

A manutenção diária da base é tratada como uma operação única, auditável e compartilhada entre scheduler, CLI e HTTP.

O objetivo não é apenas buscar o concurso mais recente: a rotina também repara lacunas, atualiza agenda, revisita rateios relevantes e reconcilia apostas reais sem criar caminhos paralelos de atualização.

## O que acontece em uma sincronização operacional

Para cada loteria (`mega-sena`, `lotofacil`, `dia-de-sorte`), o Loto Lab:

1. consulta a fonte oficial da CAIXA;
2. compara a numeração oficial com o que existe no PostgreSQL;
3. preenche concursos ausentes usando o bootstrap idempotente;
4. atualiza novamente o concurso oficial mais recente;
5. revisita rateios financeiros recentes que ainda estão incompletos;
6. revisita também concursos recentes com apostas reais auditáveis, mesmo quando a grade já parecia completa, para capturar correções oficiais posteriores;
7. reconcilia apostas cujo financeiro pode ter sido finalmente resolvido ou revisado;
8. atualiza o snapshot de Agenda quando a fonte suporta a informação de próximo concurso/data;
9. reconcilia apostas pendentes da loteria;
10. persiste o resultado da operação em `operation_runs`;
11. atualiza notificações derivadas do novo estado operacional.

Nenhuma dezena, prêmio ou custo é inventado. A CAIXA continua sendo a fonte dos concursos, agenda e rateios oficiais.

## Janela de reparo financeiro

A rotina revisita os **20 concursos mais recentes** de cada loteria.

Dentro dessa janela são candidatos a nova consulta:

- concursos cuja grade de prêmio ainda está incompleta;
- concursos com grade completa que possuem aposta real associada.

O segundo caso permite capturar uma correção oficial de valor sem multiplicar requisições para todo o histórico.

A persistência preserva a informação mais completa conhecida:

- grade incompleta existente + grade completa nova → promove para completa;
- grade completa existente + snapshot incompleto novo → preserva a completa;
- grade completa existente + grade completa nova → permite atualização de valores oficiais.

Quando uma correção oficial altera prêmio/resultado líquido de uma aposta já conferida, a reconciliação registra a revisão financeira e recalcula o KPI real.

Detalhes em [`RELIABILITY.md`](RELIABILITY.md) e [`REAL_BETS.md`](REAL_BETS.md).

## Execução manual

```bash
npm run ops:sync
```

O comando processa as três loterias e retorna o resultado agregado da operação.

## Execução automática junto da API

`npm run api:start` aplica migrations pendentes e inicia o scheduler operacional quando habilitado.

Configuração padrão:

```env
OPS_AUTO_SYNC=true
OPS_INTERVAL_MINUTES=30
OPS_STALE_AFTER_MINUTES=180
OPS_SHUTDOWN_TIMEOUT_SECONDS=25
```

- `OPS_AUTO_SYNC`: use `false` para desativar o scheduler;
- `OPS_INTERVAL_MINUTES`: intervalo entre execuções automáticas;
- `OPS_STALE_AFTER_MINUTES`: idade a partir da qual o estado operacional é considerado desatualizado;
- `OPS_SHUTDOWN_TIMEOUT_SECONDS`: limite de drenagem no encerramento gracioso.

O scheduler executa uma sincronização inicial e depois respeita o intervalo configurado.

## Concorrência

A sincronização usa um advisory lock próprio do PostgreSQL. Se outra execução já estiver ativa, uma segunda chamada não inicia trabalho duplicado.

O mesmo lock protege contra sobreposição entre:

- scheduler automático;
- `npm run ops:sync`;
- ação manual da interface;
- `POST /api/v1/operations/sync`.

A aplicação também mantém um lock de runtime separado para garantir o modelo atual de uma instância ativa por banco.

## Status persistido

`operation_runs` registra execuções com status:

- `running`;
- `success`;
- `partial`;
- `failed`;
- `abandoned` para recovery de uma execução deixada aberta por uma instância anterior.

Uma operação pode terminar como `partial` quando, por exemplo:

- uma loteria teve falhas de bootstrap;
- uma atualização de rateio recente falhou;
- a atualização de notificações falhou após o sync principal.

Isso evita transformar falha parcial em sucesso silencioso.

## Detalhes auditáveis

O payload de `SyncAllDetails` registra, entre outros dados:

- resultado por loteria;
- último concurso oficial;
- próximo concurso/data quando disponíveis;
- lacunas detectadas antes da execução;
- quantidade de concursos buscados e falhos;
- total armazenado;
- rateios recentes atualizados e falhas de atualização;
- apostas cujo financeiro foi resolvido;
- apostas cujo financeiro foi revisado;
- resultado da atualização de notificações.

## API

### Métricas operacionais

```http
GET /api/v1/ops/metrics
```

O endpoint autenticado agrega sinais de cardinalidade fixa do processo atual e do PostgreSQL:

- requests, taxas 4xx/5xx e latências HTTP por família estável de rota;
- snapshot persistido da fila de Analysis Jobs;
- `postgres.totalConnections`;
- `postgres.idleConnections`;
- `postgres.activeConnections`;
- `postgres.waitingRequests`;
- `caixa.requests`, `caixa.successes`, `caixa.errors` e `caixa.timeouts`;
- `caixa.errorRate` e `caixa.timeoutRate`;
- `caixa.latencyMs.samples/p50/p95/p99` para as chamadas HTTP realmente feitas pelo `CaixaContestSource`.

As contagens do PostgreSQL são lidas diretamente do `pg.Pool` já usado pela aplicação. Elas não carregam SQL, query, loteria, request ID ou outro identificador como label e não criam uma segunda fonte de verdade. Nesta etapa não existe threshold de saturação nem SLO derivado desses números: a baseline deve ser observada antes de qualquer tuning de tamanho do pool, timeout, índice ou concorrência.

As métricas da CAIXA também são process-local e de cardinalidade fixa. Elas medem o boundary de requisição externa — incluindo parse da resposta HTTP — sem expor loteria, concurso, URL livre, payload ou identificadores. `timeout` fica separado de outros erros para permitir construir uma baseline antes de decidir backoff, jitter, timeout ou SLO. Nenhum desses parâmetros é alterado nesta fatia.

### Estado operacional

```http
GET /api/v1/operations/status
```

Retorna:

- scheduler habilitado/desabilitado;
- intervalo;
- limite de desatualização;
- idade da última execução;
- último `operation_run`;
- indicador `stale`;
- snapshot `sync` de baixa cardinalidade derivado do mesmo `operation_run`, com `status`, `partial`, `running` e `durationMs` quando existe início/fim válidos.

`sync.status` usa apenas o conjunto fechado `running | success | partial | failed | abandoned | unknown`. `durationMs` não é inventado para uma execução ainda aberta ou timestamps inválidos. Não existe contador paralelo em memória: PostgreSQL continua sendo a fonte de verdade operacional.

O estado é considerado desatualizado quando não existe execução válida recente ou quando a última execução terminou como `failed`/`abandoned`.

### Sincronizar agora

```http
POST /api/v1/operations/sync
```

Executa a mesma rotina usada pelo scheduler e CLI.

Se já houver uma sincronização em andamento, retorna HTTP `409` com `OPERATION_ALREADY_RUNNING`.

## Agenda e notificações

Quando a fonte oficial retorna os dados necessários, o sync persiste o próximo concurso e a próxima data de sorteio. Depois da operação, o serviço de notificações atualiza estados derivados.

Falha nessa etapa não é ignorada: o run registra `notificationRefresh: failed` e uma execução que seria `success` passa para `partial`.

## Interface

O estado operacional é usado pelo Painel e pelas superfícies dedicadas de operação/agenda para mostrar:

- atualização recente ou atrasada;
- idade da última sincronização;
- frequência do scheduler;
- cobertura histórica/financeira;
- próxima informação operacional quando disponível.

A apresentação pode evoluir com o Protótipo 1, mas a fonte de verdade permanece a operação persistida no backend.

## Logs e shutdown

Eventos relevantes são registrados em JSON com IDs de correlação e duração quando aplicável.

No encerramento por `SIGINT`/`SIGTERM`, o processo:

1. para de aceitar novas conexões;
2. interrompe timers;
3. drena trabalho em andamento dentro do timeout configurado;
4. libera locks;
5. encerra o pool PostgreSQL.

O objetivo é evitar deixar sync/job em estado ambíguo ou encerrar o banco antes de uma operação já iniciada terminar sua persistência.
